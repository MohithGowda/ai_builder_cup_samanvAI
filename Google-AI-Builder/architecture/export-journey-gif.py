import base64
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image


def encode(payload, output):
    sources = payload["frames"]
    if not 2 <= len(sources) <= 256:
        raise ValueError("Expected 2 to 256 PNG frames")
    frames = []
    for source in sources:
        if not source.startswith("data:image/png;base64,"):
            raise ValueError("Expected a PNG data URI")
        with Image.open(io.BytesIO(base64.b64decode(source.split(",", 1)[1], validate=True))) as image:
            if image.width > 1560 or image.height > 860:
                raise ValueError("Unexpected frame dimensions")
            frames.append(image.convert("RGB").quantize(colors=128))
    if len({frame.size for frame in frames}) != 1:
        raise ValueError("Frame sizes must match")
    frames[0].save(output, format="GIF", save_all=True, append_images=frames[1:], duration=200, loop=0, disposal=2, optimize=False)
    return {"frames": len(frames), "duration": len(frames) / 5, "bytes": Path(output).stat().st_size}


def self_test():
    sources = []
    for color in ("green", "blue"):
        buffer = io.BytesIO()
        Image.new("RGB", (64, 36), color).save(buffer, format="PNG")
        sources.append("data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"))
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "test.gif"
        result = encode({"frames": sources}, output)
        with Image.open(output) as image:
            assert image.is_animated and image.n_frames == 2
            assert image.size == (64, 36)
        print(json.dumps(result))


if __name__ == "__main__":
    if sys.argv[1] == "--self-test":
        self_test()
    else:
        print(json.dumps(encode(json.load(sys.stdin), sys.argv[1])))