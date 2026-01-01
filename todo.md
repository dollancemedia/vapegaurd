
## Review & Summary of Changes (2025-12-31)

### Issue Addressed
The user reported an "infinite loop" of WebSocket errors ("1000+ logs very very quickly") on the frontend, which likely caused the console to crash and prevented the dashboard from displaying live sensor data.

### Root Cause Analysis
1.  **Dependency Loop**: In `frontend/src/hooks/useWebSocket.js`, the `connect` function depended on `connectionAttempts`. When a connection closed (e.g., due to a momentary network blip or initial failure), `connectionAttempts` incremented, causing `connect` to be recreated. This triggered the `useEffect` hook to run again, which called `disconnect()` and then `connect()`, creating a rapid cycle of disconnect/reconnect.
2.  **Unstable Callbacks**: The `onOpen`, `onClose`, `onMessage`, etc., callbacks passed from `Dashboard.js` were inline functions created on every render. This also caused `connect` to be recreated on every render, leading to frequent reconnections.
3.  **Excessive Logging**: Debug logs inside the loop (e.g., "Connecting to WebSocket:", "Using WebSocket URL:") flooded the console during these rapid cycles.

### Changes Implemented
1.  **Refactored `useWebSocket.js`**:
    *   **Stable Callbacks**: Used `useRef` to store the latest callback functions (`onMessage`, `onOpen`, etc.). This allows the `connect` function to invoke the latest logic without needing to be recreated when the callbacks change.
    *   **Stable Connection Logic**: Converted `connectionAttempts` from state to `useRef`. This ensures that incrementing the attempt counter does not trigger a component re-render or recreate the `connect` function, breaking the infinite loop.
    *   **Dependency Cleanup**: Removed unstable dependencies from the `connect` `useCallback` hook.
    *   **Log Cleanup**: Commented out excessive console logs ("Connecting...", "Using URL...") to clean up the developer console and improve performance.

### Verification
*   **Logic Check**: The circular dependency between state updates and effect re-execution has been broken. The WebSocket will now attempt to connect once, and if it fails, it will retry using the internal ref counter without resetting the entire connection lifecycle.
*   **Security**: No security regressions. The WebSocket still uses the token provided in query params.

### Next Steps
*   Deploy the updated frontend to Vercel.
*   Verify that the "1000+ logs" issue is gone.
*   Verify that sensor data appears on the dashboard (assuming the backend is sending data with timestamps).
