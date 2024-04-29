import { getImageDataCanvas, getImageDataPNG, toRGB, toRGBA } from './util.js';
import { CryptoError, DecodingError, EncodingError, ImageTypeError } from './error.js';
import { CRYPTO_ALGORITHM, HASH_ALGORITHM, IV_LENGTH, KEY_LENGTH, TAG_LENGTH } from './config.js';
import { decodeHeader, encodeHeader, verifyIdentifier } from './header.js';
import { encode } from '@vivaxy/png/lib/index.js';
import { COLOR_TYPES } from '@vivaxy/png/lib/helpers/color-types.js';

/**
 * Generates visual cryptography with SMZZL specification.
 * @param {HTMLImageElement|File} image Original image as HTML element or File or Blob.
 * @param {string?} pw Password for encryption. When not set, it generates with random public key.
 * @returns {Promise<{output:Blob|null,error:Error|null}>} 
 */
export async function encrypt(image, pw = '') {
    console.debug('encrypt: START');

    // (1) Load image data
    const { w, h, imageData } = await getImageDataCanvas(image);
    console.debug('encrypt: 1');

    // (2) Remove alpha channel
    const imageDataRGB = toRGB(imageData);
    console.debug('encrypt: 2');
    console.debug(`encrypt: original size: ${w}x${h}, ${imageDataRGB.length} bytes`);
    console.debug(`encrypt: [${imageDataRGB[0]}, ${imageDataRGB[1]}, ${imageDataRGB[2]}, ${imageDataRGB[3]}, ... ]`);

    // (3) Encrypt data
    let keyBytes;
    const usePassword = typeof pw === 'string' && pw !== '';
    if (usePassword) try {
        keyBytes = await getHash(pw, KEY_LENGTH);
    } catch (error) {
        console.error('encrypt: Unable to hash password.', error);
        return { output: null, error: new CryptoError('hash') };
    } else keyBytes = window.crypto.getRandomValues(new Uint8ClampedArray(KEY_LENGTH));
    let iv, ciphertext;
    try {
        const key = await window.crypto.subtle.importKey(
            'raw',
            keyBytes,
            CRYPTO_ALGORITHM,
            false,
            ['encrypt', 'decrypt'],
        );
        iv = window.crypto.getRandomValues(new Uint8ClampedArray(IV_LENGTH));
        ciphertext = await window.crypto.subtle.encrypt(
            {
                name: CRYPTO_ALGORITHM,
                iv,
                tagLength: TAG_LENGTH * 8,
            },
            key,
            imageDataRGB,
        );
    } catch (error) {
        console.error(error);
        return { output: null, error: new CryptoError('encrypt') };
    }
    console.debug('encrypt: 3');
    
    const { tag, encrypted } = splitCiphertext(new Uint8ClampedArray(ciphertext), TAG_LENGTH);

    // (4) Build header
    const { headerData, headerHeight } = encodeHeader({ w, h, iv, tag, usePassword, keyBytes });
    console.debug('encrypt: 4');

    // (5) Concat data
    const outputDataLength = headerData.length + encrypted.length;
    const outputDataRGB = new Uint8ClampedArray(outputDataLength);
    outputDataRGB.set(headerData, 0);
    outputDataRGB.set(encrypted, headerData.length);
    console.debug('encrypt: 5');
    console.debug(`[${outputDataRGB[0]}, ${outputDataRGB[1]}, ${outputDataRGB[2]}, ${outputDataRGB[3]}]`);

    // (6) Add alpha channel
    const outputDataRGBA = toRGBA(outputDataRGB);
    console.debug('encrypt: 6');

    // (7) Encode finalized image
    const outputHeight = h + headerHeight;
    let blob;
    try {
        const encoded = encode({
            width: w,
            height: outputHeight,
            depth: 8,
            colorType: COLOR_TYPES.TRUE_COLOR_WITH_ALPHA,
            compression: 0,
            interlace: 0,
            filter: 0,
            data: outputDataRGBA,
        });
        blob = new Blob([encoded]);
    } catch (error) {
        console.error(error);
        return { output: null, error: new EncodingError('png') };
    }
    console.debug('encrypt: 7');

    console.debug(`encrypt: output: ${w}x${outputHeight}, ${outputDataRGB.length} bytes`);
    console.debug(`encrypt: output encoded: ${blob.size} bytes`);    
    console.debug('encrypt: FINISHED');
    return { output: blob, error: null };
}

/**
 * Splits ciphertext into encrypted data and tag.
 * @param {Uint8ClampedArray} ciphertext Encrypted output with tag appended.
 * @param {number} tagLength Tag length in bytes.
 * @returns {{ tag: Uint8ClampedArray, encrypted: Uint8ClampedArray }}
 */
function splitCiphertext(ciphertext, tagLength = 16) {
    const index = ciphertext.length - tagLength;
    const encrypted = ciphertext.subarray(0, index);
    const tag = ciphertext.subarray(index);
    return { tag, encrypted };
}

/**
 * Digest a hash with output length.
 * @param {string} input Input data as string.
 * @param {number} length Output length.
 * @returns {Promise<Uint8ClampedArray>} Output as as TypedArray.
 */
async function getHash(input, length = KEY_LENGTH) {
    const utf8 = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest(HASH_ALGORITHM, utf8);
    return new Uint8ClampedArray(hashBuffer).subarray(0, length);
}

/**
 * Decrypts SMZZL cryptography to original image.
 * @param {File} image Cryptography image as File. This must not be acquired by Canvas API.
 * @param {string?} pw Password for decryption.
 * @returns {Promise<{output:Blob|null,error:Error|null}>}
 */
export async function decrypt(image, pw = '') {
    if (!image || !(image instanceof File || image instanceof Blob)) return { output: null, error: new ImageTypeError(image, 'File, Blob') };
    
    // (1) Load image data
    const pngData = await getImageDataPNG(image);
    if (!pngData) return { output: null, error: new DecodingError('PNG decoding failed') };
    const imageDataRGB = pngData.data;
    console.debug('decrypt: 1');
    console.debug(`[${imageDataRGB[0]}, ${imageDataRGB[1]}, ${imageDataRGB[2]}, ${imageDataRGB[3]}]`);

    // (2) Check signiture
    if (!verifyIdentifier(imageDataRGB)) return { output: null, error: new DecodingError('signiture not found') };
    console.debug('decrypt: 2');
    
    // (3) Read header
    const header = decodeHeader(imageDataRGB);
    if (!header) return { output: null, error: new DecodingError('invalid header') };
    console.debug('decrypt: 3');

    // (4) Decrypt data
    let keyBytes = header.keyBytes;
    if (header.usePassword) {
        if (typeof pw !== 'string' || pw === '') return { output: null, error: new CryptoError('no password') };
        try {
            keyBytes = await getHash(pw, KEY_LENGTH);    
        } catch (error) {
            console.error(error);
            return { output: null, error: new CryptoError('hash') };
        }
    }
    let key;
    try {
        key = await window.crypto.subtle.importKey(
            'raw',
            keyBytes,
            CRYPTO_ALGORITHM,
            false,
            ['encrypt', 'decrypt']
        );
    } catch (error) {
        console.error(error);
        return { output: null, error: new CryptoError('import key') };
    }
    let plaintext;
    try {
        const headerLength = header.headerHeight * 3 * header.w;
        const dataLength = imageDataRGB.length - headerLength + TAG_LENGTH;
        const data = new Uint8ClampedArray(dataLength);
        const encrypted = imageDataRGB.subarray(headerLength);
        data.set(encrypted, 0);
        data.set(header.tag, encrypted.length);
        plaintext = await window.crypto.subtle.decrypt(
            {
                name: CRYPTO_ALGORITHM,
                iv: header.iv,
                tagLength: TAG_LENGTH * 8
            },
            key,
            data
        );
    } catch (error) {
        console.error(error);
        return { output: null, error: new CryptoError('decrypt') };
    }
    const outputDataRGB = new Uint8ClampedArray(plaintext);
    console.debug('decrypt: 4');

    // (5) Add alpha channel
    const outputDataRGBA = toRGBA(outputDataRGB);
    console.debug('decrypt: 5');

    // (6) Encode finalized image
    let blob;
    try {
        const encoded = encode({
            width: header.w,
            height: header.h,
            depth: 8,
            colorType: COLOR_TYPES.TRUE_COLOR_WITH_ALPHA,
            compression: 0,
            interlace: 0,
            filter: 0,
            data: outputDataRGBA,
        });
        blob = new Blob([encoded]);
    } catch (error) {
        console.error(error);
        return { output: null, error: new EncodingError('png') };
    }
    console.debug('decrypt: 6');

    console.debug(`decrypt: output: ${header.w}x${header.h}, ${outputDataRGB.length} bytes`);
    console.debug(`decrypt: output encoded: ${blob.size} bytes`);    
    console.debug('decrypt: FINISHED');

    return { output: blob, error: null };
}
