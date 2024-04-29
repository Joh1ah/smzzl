export class ImageTypeError extends TypeError {
    constructor(image, expected) {
        super(`Invalid type of image: received type is "${image.type ?? image}" while expected is ${expected}`);
    }
};
export class CryptoError extends Error {
    constructor(message = 'unknown') {
        super('Crypto error when: ' + message);
    }
};
export class DecodingError extends Error {
    constructor(message = 'unknown') {
        super('Cannot decode image due to: ' + message);
    }
};
export class EncodingError extends Error {
    constructor(message = 'unknown') {
        super('Cannot encode image due to: ' + message);
    }
};