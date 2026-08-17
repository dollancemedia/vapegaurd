#!/usr/bin/env python3
"""
rig_trigger.py — MQTT labelling driver for Mistio lab data collection.

Pairs with esp32_vape_sensor_v3_training/esp32_vape_sensor_v3_training.ino.

The firmware samples at a fixed 4 Hz and stamps every row with whatever label
is currently active. This script owns that label: it publishes `start <label>
<run>` / `end` on the label topic so the segment edges are machine-timed rather
than hand-timed, and it writes a session manifest recording exactly when each
edge was sent.

Each run follows the same timeline:

    ├─ pre-roll ──────┼─ puff ─┼─ post-roll (decay) ─┤ inter-run settle ┤
    label=baseline     label=X   label=X_decay          label=idle

Why the defaults look like this
-------------------------------
The current model sits at 97.6% multi-class accuracy and 98.8% vape precision
but only 91.8% vape recall. Precision that far above recall means the model is
conservative: what it flags is almost always right, but it misses roughly one
vape event in twelve. Those misses are concentrated in weak-signal conditions —
the plume is diluted, redirected, or extracted before it reaches the sensor. So
the default plan below spends most of its runs on exactly those conditions
(3-5 m standoff, exhale into a sleeve, exhaust fan running, blocked line of
sight) rather than on the easy close-range cases the model already gets right.
A smaller block of confounders (cologne, hair spray, cleaning) and plain
baseline is included so that recall gains do not quietly cost precision.

Usage
-----
    pip install paho-mqtt

    # See what the default weak-signal plan will do, without touching MQTT:
    python rig_trigger.py --broker 192.168.1.42 --plan --dry-run

    # Run the full default plan:
    python rig_trigger.py --broker 192.168.1.42 --plan

    # A single scenario, 6 runs:
    python rig_trigger.py --broker 192.168.1.42 --scenario far_3m --runs 6

    # Ad-hoc label with custom timing:
    python rig_trigger.py --broker 192.168.1.42 --label vape --runs 3 \
        --pre-roll 45 --puff 5 --post-roll 90

    # Watch live PM2.5 from the board while running:
    python rig_trigger.py --broker 192.168.1.42 --plan --watch
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover
    print("ERROR: paho-mqtt is not installed.  pip install paho-mqtt", file=sys.stderr)
    raise SystemExit(2)


# ─────────────────────────────────────────────────────────────────────────────
#  Timing defaults
# ─────────────────────────────────────────────────────────────────────────────
# Pre-roll needs to be long enough for the feature engine's baseline windows
# (pm25_base, gas_base, humidity_base) to sit on genuinely quiet air.
DEFAULT_PRE_ROLL_S  = 30.0
# One draw plus the exhale. Long enough to be a real event, short enough that
# the start edge stays meaningful.
DEFAULT_PUFF_S      = 5.0
# Decay capture. Weak-signal events peak low, so the informative part is the
# shape of the rise and fall, not the peak height — this window has to cover
# the whole return to baseline.
DEFAULT_POST_ROLL_S = 90.0
# Dead air between runs so the next pre-roll starts from true baseline.
DEFAULT_INTER_RUN_S = 120.0


@dataclass
class Scenario:
    """One repeatable physical setup."""
    name: str
    label: str
    runs: int
    instructions: str
    pre_roll_s: float = DEFAULT_PRE_ROLL_S
    puff_s: float = DEFAULT_PUFF_S
    post_roll_s: float = DEFAULT_POST_ROLL_S
    inter_run_s: float = DEFAULT_INTER_RUN_S
    notes: str = ""


# ─────────────────────────────────────────────────────────────────────────────
#  Scenario library — weak-signal first
# ─────────────────────────────────────────────────────────────────────────────
SCENARIOS: dict[str, Scenario] = {s.name: s for s in [
    # ── The recall gap: diluted / redirected / extracted plumes ──────────────
    Scenario(
        name="far_3m",
        label="vape",
        runs=8,
        instructions=(
            "Stand 3 m from the sensor, clear line of sight.\n"
            "  Normal draw, exhale directly TOWARD the sensor at head height."
        ),
        notes="Baseline weak-signal case: dilution from distance alone.",
    ),
    Scenario(
        name="far_5m",
        label="vape",
        runs=8,
        instructions=(
            "Stand 5 m from the sensor, clear line of sight.\n"
            "  Normal draw, exhale directly TOWARD the sensor at head height."
        ),
        # More dilution means a slower, flatter rise — give it longer to arrive
        # and longer to decay before calling the segment over.
        post_roll_s=120.0,
        notes="Furthest realistic standoff in a bathroom; weakest direct signal.",
    ),
    Scenario(
        name="sleeve",
        label="vape",
        runs=8,
        instructions=(
            "Stand 1.5 m from the sensor.\n"
            "  Draw, then exhale INTO your sleeve / collar / hoodie — the way\n"
            "  someone hiding it actually would. Do not aim at the sensor."
        ),
        notes="Fabric filters and disperses the aerosol; classic false negative.",
    ),
    Scenario(
        name="fan_on",
        label="vape",
        runs=8,
        instructions=(
            "Turn the exhaust fan ON and let it run 60 s before starting.\n"
            "  Stand 2 m from the sensor, exhale toward it."
        ),
        # Extraction shortens the event; decay is fast but the rise is small.
        post_roll_s=75.0,
        notes="Active extraction competes with the plume reaching the sensor.",
    ),
    Scenario(
        name="blocked_los",
        label="vape",
        runs=8,
        instructions=(
            "Put a partition between you and the sensor — stall door closed, or\n"
            "  stand around a corner. 2 m away. Exhale normally, not at the sensor."
        ),
        notes="No direct path; sensor sees only what diffuses around the obstacle.",
    ),
    Scenario(
        name="far_fan",
        label="vape",
        runs=6,
        instructions=(
            "Hardest case: exhaust fan ON, stand 4 m away, exhale into your sleeve.\n"
            "  Let the fan run 60 s before starting."
        ),
        post_roll_s=120.0,
        notes="Stacked weak-signal conditions — the failure mode to beat.",
    ),

    # ── Easy positives: a small anchor block so the strong signal is not
    #    diluted out of the training set by all the weak examples above.
    Scenario(
        name="close_1m",
        label="vape",
        runs=4,
        instructions=(
            "Stand 1 m from the sensor. Normal draw, exhale toward it."
        ),
        post_roll_s=75.0,
        notes="Anchor class: the strong-signal case the model already handles.",
    ),

    # ── Confounders: protect the 98.8% precision while chasing recall ────────
    Scenario(
        name="cologne",
        label="cologne",
        runs=4,
        instructions=(
            "Two sprays of cologne / body spray, 2 m from the sensor,\n"
            "  sprayed into the air toward it."
        ),
        notes="Aerosol confounder with a very different PM1/PM2.5 ratio.",
    ),
    Scenario(
        name="hair_spray",
        label="hair spray",
        runs=4,
        instructions=(
            "Two bursts of hair spray, 2 m from the sensor, into the air."
        ),
        notes="Confounder — heavier particles, slower decay than vape aerosol.",
    ),
    Scenario(
        name="cleaning",
        label="cleaning",
        runs=4,
        instructions=(
            "Two sprays of surface cleaner onto a paper towel, 2 m from the sensor."
        ),
        notes="Confounder — strong VOC / gas-resistance response, low PM.",
    ),

    # ── Negative: quiet room, nothing happening ─────────────────────────────
    Scenario(
        name="baseline_only",
        label="normal",
        runs=4,
        instructions=(
            "Do nothing. Stand still, or leave the room. This captures a clean\n"
            "  negative segment under the same conditions as the positives."
        ),
        pre_roll_s=15.0,
        puff_s=60.0,     # the "event" here is simply a minute of quiet air
        post_roll_s=15.0,
        inter_run_s=30.0,
        notes="Negative class under matched room conditions.",
    ),
]}

# Default plan, weak-signal weighted. Order matters: fan scenarios are grouped
# so the operator only changes the fan state twice in a session.
DEFAULT_PLAN = [
    "baseline_only",
    "close_1m",
    "far_3m",
    "far_5m",
    "sleeve",
    "blocked_los",
    "fan_on",
    "far_fan",
    "cologne",
    "hair_spray",
    "cleaning",
]


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────
def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def epoch_ms() -> int:
    return int(time.time() * 1000)


class Aborted(Exception):
    pass


_abort = False


def _on_sigint(_sig, _frm):
    global _abort
    _abort = True


class Rig:
    def __init__(self, args):
        self.args = args
        self.dry_run = args.dry_run
        self.topic = (
            f"mistio/lab/{args.device}/label" if args.device
            else "mistio/lab/all/label"
        )
        self.sample_topic = (
            f"mistio/lab/{args.device}/sample" if args.device
            else "mistio/lab/+/sample"
        )
        self.status_topic = (
            f"mistio/lab/{args.device}/status" if args.device
            else "mistio/lab/+/status"
        )
        self.events: list[dict] = []
        self.last_pm25: float | None = None
        self.board_online: bool | None = None
        self.client = None

        if not self.dry_run:
            # paho-mqtt 2.x requires the callback-API version; 1.x does not
            # accept the kwarg at all. Support both.
            try:
                self.client = mqtt.Client(
                    mqtt.CallbackAPIVersion.VERSION1,
                    client_id=f"mistio-rig-{os.getpid()}",
                )
            except (AttributeError, TypeError):
                self.client = mqtt.Client(client_id=f"mistio-rig-{os.getpid()}")

            if args.username:
                self.client.username_pw_set(args.username, args.password or None)
            self.client.on_message = self._on_message
            self.client.connect(args.broker, args.port, keepalive=30)
            self.client.loop_start()
            self.client.subscribe(self.status_topic)
            if args.watch:
                self.client.subscribe(self.sample_topic)
            # Give the retained status message a moment to land.
            time.sleep(0.6)
            if self.board_online is False:
                print("  ! broker reports the board as OFFLINE "
                      "(retained status). Is it powered and on WiFi?")
            elif self.board_online is None:
                print("  ! no retained status from the board yet — "
                      "labels will still publish, but check the serial log.")

    # ── MQTT ────────────────────────────────────────────────────────────────
    def _on_message(self, _client, _userdata, msg):
        try:
            payload = msg.payload.decode("utf-8", "replace").strip()
        except Exception:
            return
        if msg.topic.endswith("/status"):
            self.board_online = (payload == "online")
        elif msg.topic.endswith("/sample"):
            # CSV row; pm25 is column index 10 (see the firmware header).
            parts = payload.split(",")
            if len(parts) > 10:
                try:
                    self.last_pm25 = float(parts[10])
                except ValueError:
                    pass

    def publish(self, payload: str, kind: str, meta: dict | None = None):
        sent_iso = utc_now_iso()
        sent_ms = epoch_ms()
        if self.dry_run:
            print(f"    [dry-run] {self.topic} <- {payload!r}")
        else:
            info = self.client.publish(self.topic, payload, qos=1)
            info.wait_for_publish(timeout=5)
        rec = {
            "kind": kind,
            "payload": payload,
            "topic": self.topic,
            "sent_utc": sent_iso,
            "sent_epoch_ms": sent_ms,
        }
        if meta:
            rec.update(meta)
        self.events.append(rec)

    def close(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

    # ── Timing ──────────────────────────────────────────────────────────────
    def countdown(self, seconds: float, prefix: str):
        """Sleep with a live one-line countdown. Raises Aborted on Ctrl-C."""
        end = time.monotonic() + seconds
        while True:
            remaining = end - time.monotonic()
            if remaining <= 0:
                break
            if _abort:
                raise Aborted()
            pm = "" if self.last_pm25 is None else f"  PM2.5={self.last_pm25:6.2f}"
            sys.stdout.write(f"\r    {prefix} {remaining:5.1f}s{pm}   ")
            sys.stdout.flush()
            time.sleep(min(0.2, remaining))
        sys.stdout.write("\r" + " " * 62 + "\r")
        sys.stdout.flush()

    # ── One run ─────────────────────────────────────────────────────────────
    def run_once(self, sc: Scenario, run_id: int, run_index: int, total: int):
        print(f"\n─── {sc.name}  run {run_index}/{total}  (run_id={run_id}) "
              f"─────────────────────")
        print(f"  {sc.instructions}")
        print(f"  timeline: {sc.pre_roll_s:.0f}s baseline → "
              f"{sc.puff_s:.0f}s {sc.label} → {sc.post_roll_s:.0f}s decay")
        if not self.args.auto:
            try:
                input("  Press ENTER when you are in position... ")
            except (EOFError, KeyboardInterrupt):
                raise Aborted()

        # The firmware tokenises label commands on whitespace, so a class name
        # like "hair spray" has to go over the wire underscored. Map it back
        # when you build the training set: hair_spray -> "hair spray".
        wire = sc.label.replace(" ", "_")
        meta = {"scenario": sc.name, "run_id": run_id,
                "label": sc.label, "wire_label": wire}

        # 1. Pre-roll — explicitly labelled baseline, not idle, so the feature
        #    engine can use it as the matched baseline for this exact event.
        self.publish(f"start baseline {run_id}", "pre_roll_start", meta)
        self.countdown(sc.pre_roll_s, "baseline ")

        # 2. The event itself. This edge is the one that matters.
        print("    >>> PUFF NOW <<<\a")
        self.publish(f"start {wire} {run_id}", "event_start", meta)
        self.countdown(sc.puff_s, f"{wire:9.9s}")

        # 3. Decay window — separate label so it can be merged or excluded later.
        self.publish(f"start {wire}_decay {run_id}", "decay_start", meta)
        self.countdown(sc.post_roll_s, "decay    ")

        # 4. Close the segment.
        self.publish("end", "event_end", meta)
        print(f"  run {run_id} complete"
              + ("" if self.last_pm25 is None else f"  (last PM2.5={self.last_pm25:.2f})"))

    def run_scenario(self, sc: Scenario, start_run_id: int) -> int:
        print(f"\n{'=' * 70}")
        print(f"  SCENARIO: {sc.name}   label={sc.label}   runs={sc.runs}")
        if sc.notes:
            print(f"  {sc.notes}")
        print(f"{'=' * 70}")
        run_id = start_run_id
        for i in range(sc.runs):
            self.run_once(sc, run_id, i + 1, sc.runs)
            run_id += 1
            if i < sc.runs - 1 and sc.inter_run_s > 0:
                self.countdown(sc.inter_run_s, "settle   ")
        return run_id


# ─────────────────────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Drive Mistio lab labelling over MQTT.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--broker", default=os.environ.get("MISTIO_BROKER", "127.0.0.1"),
                   help="Mosquitto host/IP (default: %(default)s)")
    p.add_argument("--port", type=int, default=1883)
    p.add_argument("--username", default=None)
    p.add_argument("--password", default=None)
    p.add_argument("--device", default=None,
                   help="Device MAC (12 hex chars, as printed in the firmware "
                        "boot banner). Omit to broadcast on mistio/lab/all/label.")

    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true",
                      help="Run the full default weak-signal plan.")
    mode.add_argument("--scenario", action="append", metavar="NAME",
                      help="Run a named scenario (repeatable).")
    mode.add_argument("--label", metavar="LABEL",
                      help="Ad-hoc: run this raw label instead of a scenario.")
    mode.add_argument("--list-scenarios", action="store_true")

    p.add_argument("--runs", type=int, default=None,
                   help="Override the run count for the selected scenario(s).")
    p.add_argument("--pre-roll", type=float, default=None, dest="pre_roll",
                   help=f"Baseline seconds before the event (default {DEFAULT_PRE_ROLL_S:.0f})")
    p.add_argument("--puff", type=float, default=None,
                   help=f"Event seconds (default {DEFAULT_PUFF_S:.0f})")
    p.add_argument("--post-roll", type=float, default=None, dest="post_roll",
                   help=f"Decay seconds after the event (default {DEFAULT_POST_ROLL_S:.0f})")
    p.add_argument("--inter-run", type=float, default=None, dest="inter_run",
                   help=f"Settle seconds between runs (default {DEFAULT_INTER_RUN_S:.0f})")
    p.add_argument("--start-run-id", type=int, default=1)

    p.add_argument("--auto", action="store_true",
                   help="Do not wait for ENTER between runs (unattended rigs).")
    p.add_argument("--watch", action="store_true",
                   help="Subscribe to the sample topic and show live PM2.5.")
    p.add_argument("--dry-run", action="store_true",
                   help="Print the timeline without connecting to MQTT.")
    p.add_argument("--out", default=None,
                   help="Session manifest path (default: session_<UTC>.json)")
    return p


def apply_overrides(sc: Scenario, args) -> Scenario:
    sc = Scenario(**asdict(sc))
    if args.runs is not None:      sc.runs = args.runs
    if args.pre_roll is not None:  sc.pre_roll_s = args.pre_roll
    if args.puff is not None:      sc.puff_s = args.puff
    if args.post_roll is not None: sc.post_roll_s = args.post_roll
    if args.inter_run is not None: sc.inter_run_s = args.inter_run
    return sc


def main() -> int:
    args = build_parser().parse_args()
    signal.signal(signal.SIGINT, _on_sigint)

    if args.list_scenarios:
        print(f"{'name':<15}{'label':<12}{'runs':>5}  timeline (pre/puff/post/settle)")
        print("-" * 78)
        for name, sc in SCENARIOS.items():
            mark = "*" if name in DEFAULT_PLAN else " "
            print(f"{mark}{name:<14}{sc.label:<12}{sc.runs:>5}  "
                  f"{sc.pre_roll_s:.0f}/{sc.puff_s:.0f}/"
                  f"{sc.post_roll_s:.0f}/{sc.inter_run_s:.0f}s")
        print("\n* = included in --plan")
        return 0

    # Resolve what to run.
    if args.plan:
        selected = [apply_overrides(SCENARIOS[n], args) for n in DEFAULT_PLAN]
    elif args.scenario:
        unknown = [n for n in args.scenario if n not in SCENARIOS]
        if unknown:
            print(f"ERROR: unknown scenario(s): {', '.join(unknown)}", file=sys.stderr)
            print("       use --list-scenarios to see the options", file=sys.stderr)
            return 2
        selected = [apply_overrides(SCENARIOS[n], args) for n in args.scenario]
    elif args.label:
        selected = [apply_overrides(Scenario(
            name=f"adhoc_{args.label.replace(' ', '_')}",
            label=args.label,
            runs=args.runs if args.runs is not None else 1,
            instructions=f"Ad-hoc run, label '{args.label}'.",
        ), args)]
    else:
        print("Nothing selected. Use --plan, --scenario NAME, --label LABEL, "
              "or --list-scenarios.", file=sys.stderr)
        return 2

    total_runs = sum(sc.runs for sc in selected)
    est_s = sum(
        sc.runs * (sc.pre_roll_s + sc.puff_s + sc.post_roll_s)
        + max(0, sc.runs - 1) * sc.inter_run_s
        for sc in selected
    )
    print("=" * 70)
    print("  MISTIO RIG TRIGGER")
    print("=" * 70)
    print(f"  broker      : {args.broker}:{args.port}"
          + ("   [DRY RUN — nothing will be published]" if args.dry_run else ""))
    print(f"  label topic : mistio/lab/{args.device or 'all'}/label")
    print(f"  scenarios   : {', '.join(sc.name for sc in selected)}")
    print(f"  total runs  : {total_runs}")
    print(f"  est. time   : {est_s / 60:.0f} min of rig time (plus your pauses)")
    print()
    print("  Before you start: the BME680 gas heater needs ~3 minutes from power-on")
    print("  to settle. Check the serial CSV is flowing and PM2.5 is at baseline.")
    print("=" * 70)

    rig = Rig(args)
    started = utc_now_iso()
    run_id = args.start_run_id
    aborted = False
    try:
        for sc in selected:
            run_id = rig.run_scenario(sc, run_id)
    except Aborted:
        aborted = True
        print("\n\n  ABORTED — sending 'end' so the stream does not stay labelled.")
        try:
            rig.publish("end", "abort_end", None)
        except Exception as exc:  # pragma: no cover
            print(f"  ! could not publish end: {exc}", file=sys.stderr)
    finally:
        rig.close()

    out = args.out or f"session_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
    manifest = {
        "session_started_utc": started,
        "session_ended_utc": utc_now_iso(),
        "aborted": aborted,
        "broker": f"{args.broker}:{args.port}",
        "label_topic": rig.topic,
        "device": args.device,
        "dry_run": args.dry_run,
        "scenarios": [asdict(sc) for sc in selected],
        "events": rig.events,
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    print(f"\n  Session manifest written to {out}")
    print("  Join it to the serial CSV on (boot_id, run_id) or on epoch_ms.")
    return 1 if aborted else 0


if __name__ == "__main__":
    raise SystemExit(main())
