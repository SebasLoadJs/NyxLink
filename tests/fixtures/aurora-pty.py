"""Linux PTY acceptance of the packed consumer; captures actual terminal bytes."""
import errno
import fcntl
import os
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time
from pathlib import Path

node, output = sys.argv[1:]
out = Path(output)
out.mkdir(parents=True, exist_ok=True)

def session(name, args, width=80, steps=(), no_color=False):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, width, 0, 0))
    env = dict(os.environ)
    for key in ("CI", "NO_COLOR", "FORCE_COLOR"):
        env.pop(key, None)
    env["TERM"] = "xterm-256color"
    if no_color:
        env["NO_COLOR"] = "1"
    else:
        env["FORCE_COLOR"] = "1"
    child = subprocess.Popen([node, *args], stdin=slave, stdout=slave, stderr=slave, env=env)
    os.close(slave)
    data = bytearray()
    deadline = time.monotonic() + 20
    try:
        def read_until(marker=None):
            while time.monotonic() < deadline:
                if marker is not None and marker in data:
                    return
                readable, _, _ = select.select([master], [], [], 0.1)
                if readable:
                    try:
                        chunk = os.read(master, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        break
                    if not chunk:
                        break
                    data.extend(chunk)
                    if len(data) > 2_000_000:
                        raise AssertionError("PTY output exceeded bound")
                elif child.poll() is not None:
                    break
            if marker is not None and marker not in data:
                raise AssertionError("PTY marker missing: " + repr(marker))
        for marker, key in steps:
            read_until(marker)
            if isinstance(key, int):
                fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 30, key, 0, 0))
                os.kill(child.pid, signal.SIGWINCH)
            else:
                os.write(master, key)
        read_until()
        assert child.wait(timeout=2) == 0, name
        return bytes(data)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
        (out / (name + ".ansi")).write_bytes(data)

for width in (40, 80, 120):
    raw = session("aurora-" + str(width), ["aurora-demo.mjs", "--scenario", "failover"], width)
    assert b"SIMULATED AURORA DEMO" in raw and b"FAILOVER RECOVERED" in raw
    assert b"\x1b[" in raw, "expected terminal styling"
    assert b"private-" not in raw
plain = session("aurora-no-color", ["aurora-demo.mjs", "--scenario", "startup"], no_color=True)
assert b"\x1b" not in plain
assert plain.count(b"Backend session ready") == 2
# A distinct host-owned region; verifies clear/repaint/release on a real PTY.
region = session("coordinator", ["aurora-pty-region.mjs"])
assert b"\r\x1b[2Kconnecting" in region
assert b"PERSISTENT EVENT" in region
assert region.count(b"connecting") == 2
assert b"\x1b[?25l" not in region
inspector = session("inspector", ["aurora-demo.mjs", "--format", "silent", "--inspector"],
    steps=((b"[Overview]", b"\t"), (b"[Nodes]", b"\t"), (b"[Players]", b"\t"), (b"[Events]", b"\t"), (b"[Traces]", b"q")))
assert b"SIMULATED" in inspector and b"PLAYER-01" in inspector
assert b"QUEUE_ADDED" in inspector and b"No completed spans supplied by host." in inspector
resize = session("resize", ["aurora-pty-region.mjs", "--resize"], width=40,
    steps=((b"READY-TO-RESIZE", 12), (b"\x1b[2Kabcdefghijk", b"q\n")))
assert b"\x1b[2Kabcdefghijklmnopqrstuvwxyz" in resize
assert b"\x1b[2Kabcdefghijk" in resize
assert b"\x1b[?25l" not in resize
print("PTY acceptance: 7 sessions passed")
