from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
CANVAS = 1024
SCALE = CANVAS / 128


def box(x1: float, y1: float, x2: float, y2: float) -> tuple[int, int, int, int]:
    return tuple(round(value * SCALE) for value in (x1, y1, x2, y2))


def make_master() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gradient = Image.new("RGBA", image.size)
    pixels = gradient.load()
    start = (56, 189, 248)
    middle = (20, 125, 184)
    end = (91, 63, 184)

    for y in range(CANVAS):
        for x in range(CANVAS):
            progress = min(1.0, max(0.0, (x + y) / (2 * (CANVAS - 1))))
            if progress <= 0.5:
                local = progress * 2
                left, right = start, middle
            else:
                local = (progress - 0.5) * 2
                left, right = middle, end
            pixels[x, y] = tuple(round(left[i] + (right[i] - left[i]) * local) for i in range(3)) + (255,)

    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box(4, 4, 124, 124), radius=round(28 * SCALE), fill=255)
    image.alpha_composite(Image.composite(gradient, Image.new("RGBA", image.size), mask))

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    for coordinates in ((22, 21, 106, 46), (33, 52, 109, 77), (18, 83, 100, 108)):
        shifted = (coordinates[0], coordinates[1] + 3, coordinates[2], coordinates[3] + 3)
        shadow_draw.rounded_rectangle(box(*shifted), radius=round(12.5 * SCALE), fill=(7, 17, 31, 95))
    shadow = shadow.filter(ImageFilter.GaussianBlur(round(3 * SCALE)))
    image.alpha_composite(shadow)

    draw = ImageDraw.Draw(image)
    pills = (
        ((22, 21, 106, 46), (36, 33.5), (14, 165, 233), (47, 29.5, 92, 37.5)),
        ((33, 52, 109, 77), (47, 64.5), (139, 92, 246), (58, 60.5, 95, 68.5)),
        ((18, 83, 100, 108), (32, 95.5), (245, 158, 11), (43, 91.5, 86, 99.5)),
    )
    for pill, dot, dot_color, line in pills:
        draw.rounded_rectangle(box(*pill), radius=round(12.5 * SCALE), fill=(255, 255, 255, 255))
        radius = 5 * SCALE
        center_x, center_y = dot[0] * SCALE, dot[1] * SCALE
        draw.ellipse((round(center_x - radius), round(center_y - radius), round(center_x + radius), round(center_y + radius)), fill=dot_color + (255,))
        draw.rounded_rectangle(box(*line), radius=round(4 * SCALE), fill=(200, 212, 227, 255))
    return image


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    master = make_master()
    for size in (16, 32, 48, 128):
        output = master.resize((size, size), Image.Resampling.LANCZOS)
        output.save(ICON_DIR / f"icon{size}.png", optimize=True)
        print(f"generated icons/icon{size}.png")


if __name__ == "__main__":
    main()
