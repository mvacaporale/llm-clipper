#!/usr/bin/env python3
"""Generate PNG icons for LLM Clipper extension from source image."""

from PIL import Image

def create_icons_from_image(source_path: str):
    """Create sized icons from a source image."""
    # Open source image
    img = Image.open(source_path).convert('RGBA')

    # Crop to content (remove transparent edges)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Make it square by padding
    max_dim = max(img.size)
    square = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))
    offset = ((max_dim - img.size[0]) // 2, (max_dim - img.size[1]) // 2)
    square.paste(img, offset)

    sizes = [16, 48, 128]

    for size in sizes:
        # Resize with high quality
        resized = square.resize((size, size), Image.Resampling.LANCZOS)

        # Save active (color) version
        resized.save(f'icons/icon-active-{size}.png')
        print(f'Created icon-active-{size}.png')

        # Create grayscale for inactive
        # Convert to grayscale while preserving alpha
        r, g, b, a = resized.split()
        gray = Image.merge('RGB', (r, g, b)).convert('L')
        gray_rgba = Image.merge('RGBA', (gray, gray, gray, a))
        gray_rgba.save(f'icons/icon-inactive-{size}.png')
        print(f'Created icon-inactive-{size}.png')

    print('Done!')


if __name__ == '__main__':
    source = '/Users/michaelangelocaporale/Downloads/Untitled design (1).png'
    create_icons_from_image(source)
