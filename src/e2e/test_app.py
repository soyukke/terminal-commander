"""
Terminal Commander E2E tests via Inspector protocol (JSON over TCP).

No external dependencies — uses raw sockets to speak the playheavy protocol.
Compatible with playheavy Inspector but does not require the playheavy package.

Usage:
    1. Ensure inspector-port = 9274 in ~/.config/terminal-commander/config
    2. bash scripts/e2e-test.sh
       (or: bun start & sleep 5 && python3 src/e2e/test_app.py)
"""

import json
import socket
import time
import sys
import base64

PORT = 9274


# ================================================================
# Inspector Client (minimal, playheavy-protocol compatible)
# ================================================================


class InspectorClient:
    def __init__(self, host: str = "127.0.0.1", port: int = PORT, timeout: int = 30):
        self._sock = socket.create_connection((host, port), timeout=timeout)
        self._rfile = self._sock.makefile("rb")
        self._next_id = 1

    def send(self, method: str, **params) -> dict:
        msg = {"id": self._next_id, "method": method, **params}
        self._next_id += 1
        self._sock.sendall((json.dumps(msg, separators=(",", ":")) + "\n").encode())
        line = self._rfile.readline().decode()
        if not line:
            raise ConnectionError("Server closed connection")
        resp = json.loads(line)
        if "error" in resp:
            raise RuntimeError(f"Inspector error: {resp['error']}")
        return resp

    def subscribe(self, event: str, eid: int | None = None):
        params: dict = {"event": event}
        if eid is not None:
            params["eid"] = eid
        self.send("subscribe", **params)

    def unsubscribe(self, event: str):
        self.send("unsubscribe", event=event)

    def read_event(self, timeout: float = 5.0) -> dict | None:
        import select
        ready, _, _ = select.select([self._sock], [], [], timeout)
        if not ready:
            return None
        line = self._rfile.readline().decode()
        if not line:
            return None
        return json.loads(line)

    def health(self) -> dict:
        return self.send("health")

    def wait_until_ready(self, timeout: float = 30.0, interval: float = 0.5):
        """health をポーリングして ready:true になるまで待機する。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                resp = self.health()
                if resp.get("ready"):
                    return resp
            except Exception:
                pass
            time.sleep(interval)
        raise TimeoutError(f"App not ready within {timeout}s")

    def close(self):
        self._rfile.close()
        self._sock.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ================================================================
# Tests
# ================================================================


def test_ping():
    """Inspector に接続して ping が通ること。"""
    with InspectorClient() as c:
        resp = c.send("ping")
        assert resp.get("ok") is True, f"Expected ok:true, got {resp}"


def test_health_and_ready():
    """health でアプリ初期化完了を待機できること。"""
    with InspectorClient() as c:
        resp = c.wait_until_ready(timeout=30.0)
        assert resp.get("ready") is True
        assert resp.get("element_count", 0) >= 1


def test_list_elements():
    """list で要素一覧が取得できること。"""
    with InspectorClient() as c:
        c.wait_until_ready()
        resp = c.send("list")
        elements = resp.get("elements", [])
        assert isinstance(elements, list)
        assert len(elements) >= 1, f"Expected at least 1 element, got {len(elements)}"


def test_find_all_tiles():
    """find_all で custom ロールのタイルを取得できること。"""
    with InspectorClient() as c:
        c.wait_until_ready()
        resp = c.send("find_all", role="custom")
        tiles = resp.get("elements", [])
        assert len(tiles) >= 1, f"Expected at least 1 tile, got {len(tiles)}"


def test_tile_has_properties():
    """タイルがカスタムプロパティ (terminal_id, status) を持つこと。"""
    with InspectorClient() as c:
        c.wait_until_ready()
        resp = c.send("find_all", role="custom")
        tile = resp["elements"][0]
        assert "terminal_id" in tile, f"Missing terminal_id in {tile}"
        assert "status" in tile, f"Missing status in {tile}"
        assert tile["status"] in ("running", "idle", "exited")


def test_write_and_read_output():
    """ターミナルに書き込み、出力バッファから結果を読み取れること。"""
    with InspectorClient() as c:
        c.wait_until_ready()

        # Create a shell tile (not claude) so we can echo
        resp = c.send("create_tile", cols=80, rows=24, command="/bin/bash")
        tid = resp["terminal_id"]
        time.sleep(1)

        marker = f"e2e-marker-{int(time.time())}"
        c.send("write_to_terminal", terminal_id=tid, data=f"echo {marker}\n")
        time.sleep(2)

        resp = c.send("get_terminal_output", terminal_id=tid)
        assert marker in resp.get("text", ""), f"Marker '{marker}' not found in output"

        # Cleanup
        c.send("close_tile", terminal_id=tid)


def test_create_and_close_tile():
    """タイルの作成と削除ができること。"""
    with InspectorClient() as c:
        c.wait_until_ready()
        initial = c.send("find_all", role="custom")
        initial_count = len(initial["elements"])

        # Create
        resp = c.send("create_tile", cols=80, rows=24)
        assert "terminal_id" in resp, f"Expected terminal_id in response: {resp}"
        tid = resp["terminal_id"]

        time.sleep(0.5)
        after_create = c.send("find_all", role="custom")
        assert len(after_create["elements"]) == initial_count + 1

        # Close
        c.send("close_tile", terminal_id=tid)
        time.sleep(0.5)
        after_close = c.send("find_all", role="custom")
        assert len(after_close["elements"]) == initial_count


def test_subscribe_element_added():
    """element_added イベントを購読してタイル追加を検出できること。"""
    # Use two connections: one for subscribe, one for actions
    with InspectorClient() as listener, InspectorClient() as actor:
        listener.wait_until_ready()
        listener.subscribe("element_added")

        resp = actor.send("create_tile", cols=80, rows=24)
        tid = resp["terminal_id"]

        event = listener.read_event(timeout=5.0)
        assert event is not None, "Expected element_added event"
        assert event.get("event") == "element_added"

        # Cleanup
        actor.send("close_tile", terminal_id=tid)
        listener.unsubscribe("element_added")


def test_screenshot():
    """スクリーンショットを取得できること (要スクリーンキャプチャ権限)。"""
    with InspectorClient(timeout=60) as c:
        c.wait_until_ready()
        try:
            resp = c.send("screenshot")
        except (TimeoutError, socket.timeout):
            print("    (skipped: screencapture timed out — grant Screen Recording permission)")
            return
        assert "image" in resp, f"Expected 'image' in response: {resp}"
        png_data = base64.b64decode(resp["image"])
        assert png_data[:4] == b"\x89PNG", "Not a valid PNG"
        assert len(png_data) > 1000, f"Screenshot too small: {len(png_data)} bytes"


# ================================================================
# Runner
# ================================================================


if __name__ == "__main__":
    tests = [
        test_ping,
        test_health_and_ready,
        test_list_elements,
        test_find_all_tiles,
        test_tile_has_properties,
        test_write_and_read_output,
        test_create_and_close_tile,
        test_subscribe_element_added,
        test_screenshot,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {test.__name__}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed > 0 else 0)
