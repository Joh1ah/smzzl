import { COLOR_TYPES } from '@vivaxy/png/lib/helpers/color-types.js';
import { decode } from '@vivaxy/png/lib/index.js';

/**
 * Get new array with alpha channel removed.
 * @param {Uint8ClampedArray} array Array of pixel data in order of RGBA.
 * @returns {Uint8ClampedArray} Array of pixel data in order of RGB.
 */
export function toRGB(array) {
    const pixels = array.length / 4;
    const result = new Uint8ClampedArray(pixels * 3);
    for (let i = 0; i < pixels; i++) {
        result[i * 3]     = array[i * 4];
        result[i * 3 + 1] = array[i * 4 + 1];
        result[i * 3 + 2] = array[i * 4 + 2];
    }
    return result;
}

/**
 * Get new array with alpha channel added.
 * @param {Uint8ClampedArray} array Array of pixel data in order of RGBA.
 * @returns {Uint8ClampedArray} Array of pixel data in order of RGB.
 */
export function toRGBA(array) {
    const pixels = array.length / 3;
    const result = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
        result[i * 4]     = array[i * 3];
        result[i * 4 + 1] = array[i * 3 + 1];
        result[i * 4 + 2] = array[i * 3 + 2];
        result[i * 4 + 3] = 255;
    }
    return result;
}

/**
 * Get image data using PNG decoder.
 * @param {File|Blob} image Image File to be decoded.
 * @returns {Promise<{w:number,h:number,colorType:COLOR_TYPES,data:Uint8ClampedArray}|null>}
 */
export async function getImageDataPNG(image) {
    const pngData = {};
    try {
        const buffer = await image.arrayBuffer();
        const meta = decode(buffer);
        pngData.colorType = meta.colorType;
        pngData.w = meta.width;
        pngData.h = meta.height;
    
        let data = new Uint8ClampedArray(meta.data);
        if (meta.colorType === COLOR_TYPES.TRUE_COLOR_WITH_ALPHA) {
            const imageDataRGBA = data;
            data = toRGB(imageDataRGBA);
        } else if (meta.colorType !== COLOR_TYPES.TRUE_COLOR) {
            console.error('Image must be RGB or RGBA.');
            return null;
        }
        pngData.data = data;
    } catch (error) {
        console.error(error);
        return null;
    }

    return pngData;
}

/**
 * Gets image data using Canvas API.
 * This should not be used for decoding SMZZL encrypted image due to fingerprint issue of Canvas API.
 * @param {HTMLImageElement|File|Blob} image Image element to be decoded.
 * @returns {Promise<{w:number,h:number,imageData:Uint8ClampedArray}>}
 */
export async function getImageDataCanvas(image) {
    if (image instanceof File || image instanceof Blob) {
        const imageElement = document.createElement('img');
        let r;
        const p = new Promise((resolve) => r = resolve);
        imageElement.onload = () => r(true);
        imageElement.onerror = () => r(false);
        imageElement.src = URL.createObjectURL(image);
        if (!await p) return { output: null, error: new DecodingError('load') };
        image = imageElement;
    }
    if (!(image instanceof HTMLImageElement)) return { output: null, error: new ImageTypeError(image, HTMLImageElement) };

    const w = image.width;
    const h = image.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h).data;
    return { w, h, imageData };
}