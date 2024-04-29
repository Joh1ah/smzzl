import { FLAG_LENGTH, FOOTERHEIGHT_INDEX, HEADERHEIGHT_INDEX, HEADER_MINIMUM_LENGTH, IV_LENGTH, KEY_LENGTH, NUMBER_LENGTH, SMZZL_IDENTIFIER, SMZZL_VERSION, TAG_LENGTH } from './config.js';

/**
 * Encodes header data into TypedArray.
 * @param {{w:number,h:number,iv:Uint8ClampedArray,tag:Uint8ClampedArray,usePassword:boolean,keyBytes:Uint8ClampedArray}} header Header data. 
 * @returns {{headerData:Uint8ClampedArray,headerHeight:number}}
 */
export function encodeHeader({ w, h, iv, tag, usePassword, keyBytes, area }) {
    let offset = 0;
    const metaDataLength = HEADER_MINIMUM_LENGTH;
    const metaData = new Uint8ClampedArray(metaDataLength);
    function setForward(data) {
        metaData.set(data, offset);
        offset += data.length;
    }
    
    setForward(SMZZL_IDENTIFIER);
    setForward(SMZZL_VERSION);
    let flag = 0x0000;
    if (usePassword) flag |= 0x8000;
    // reserved flag slot here
    // if (...) flag = |= 0x8000
    const flagArray = new Uint8ClampedArray([flag >> 8, flag & 255]);
    setForward(flagArray);
    setForward(encodeUint(w));
    setForward(encodeUint(h));
    setForward(iv);
    setForward(tag);
    keyBytes = usePassword ? window.crypto.getRandomValues(new Uint8ClampedArray(KEY_LENGTH)) : keyBytes;
    setForward(keyBytes);
    setForward(new Uint8ClampedArray(NUMBER_LENGTH)) // slot for headerHeight
    setForward(new Uint8ClampedArray(NUMBER_LENGTH)) // slot for footerHeight
    // serialized untouched area data
    let areaDataLength = 0;
    //TODO
    const areaData = new Uint8ClampedArray(areaDataLength);
    //TODO
    setForward(encodeUint(areaDataLength));    
    const rowDataLength = 3*w; // 3 cuz no alpha
    const headerHeight = Math.ceil((metaDataLength + areaDataLength) / rowDataLength);
    metaData.set(encodeUint(headerHeight), HEADERHEIGHT_INDEX);
    //TODO
    // metaData.set(encodeNumber(footerHeight), FOOTERHEIGHT_INDEX);
    const headerDataLength = headerHeight * rowDataLength;
    const headerData = window.crypto.getRandomValues(new Uint8ClampedArray(headerDataLength));
    headerData.set(metaData, 0);
    headerData.set(areaData, metaDataLength);

    return { headerData, headerHeight };
}

/**
 * Decodes header data into TypedArray.
 * @param {Uint8ClampedArray} imageData Image RGB data with header.
 */
export function decodeHeader(imageData) {
    let offset = 0;
    function readForward(length, isNumber = false) {
        const sub = imageData.subarray(offset, offset + length);
        offset += length;
        if (isNumber) return decodeUint(sub);
        return sub;
    }
    try {
        const header = {};

        header.signiture = readForward(SMZZL_IDENTIFIER.length);
        const version = readForward(SMZZL_VERSION.length);
        if (version[0] !== SMZZL_VERSION[0]) return null;
        header.version = version[0];
        const flagArray = readForward(FLAG_LENGTH);
        header.usePassword = (flagArray[0] & 0x80) && true;
        header.w = readForward(NUMBER_LENGTH, true);
        header.h = readForward(NUMBER_LENGTH, true);
        header.iv = readForward(IV_LENGTH);
        header.tag = readForward(TAG_LENGTH);
        header.keyBytes = readForward(KEY_LENGTH);
        header.headerHeight = readForward(NUMBER_LENGTH, true);
        header.footerHeight = readForward(NUMBER_LENGTH, true);
        header.areaDataLength = readForward(NUMBER_LENGTH, true);

        return header;
    } catch (error) {
        console.error(error);
        return null;
    }
}

/**
 * Encode number as uint32.
 * @param {number} num Integer value.
 */
function encodeUint(num) {
    return new Uint8ClampedArray([
        (num >> 24) & 255,
        (num >> 16) & 255,
        (num >> 8) & 255,
        num & 255,
    ]);
}

/**
 * Decodes uint32 number.
 * @param {Uint8ClampedArray} array Encoded integer value.
 */
function decodeUint(array) {
    return array[0] * 0x01000000
        + array[1] * 0x00010000
        + array[2] * 0x00000100
        + array[3];
}

export function verifyIdentifier(data) {
    for (let i = 0; i < SMZZL_IDENTIFIER.length; i++) {
        if (data[i] !== SMZZL_IDENTIFIER[i]) return false;
    }
    return true;
}