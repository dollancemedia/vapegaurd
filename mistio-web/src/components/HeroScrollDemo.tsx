import React from "react";
import { ContainerScroll } from "./ui/container-scroll-animation";

export function HeroScrollDemo() {
  return (
    <div className="flex flex-col overflow-hidden bg-white">
      <ContainerScroll
        titleComponent={
          <>
            <h1 className="text-4xl font-semibold text-mistio-dark">
              All with a <br />
              <span className="text-4xl md:text-[6rem] font-bold mt-1 leading-none text-mistio-teal">
                Real-time Dashboard
              </span>
            </h1>
          </>
        }
      >
        <video
          src="/sigmadashboard.mp4"
          className="mx-auto rounded-2xl object-cover h-full w-full"
          draggable={false}
          autoPlay
          loop
          muted
          playsInline
        />
      </ContainerScroll>
    </div>
  );
}
