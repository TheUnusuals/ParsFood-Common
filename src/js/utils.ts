const lowercaseLetters = "abcdefghijklmnopqrstuvwxyz";
const uppercaseLetters = lowercaseLetters.toLocaleUpperCase();
const numbers = "0123456789";

export const charsets = {
    lowercase: lowercaseLetters,
    uppercase: uppercaseLetters,
    numbers: numbers,
    alphanumeric: `${lowercaseLetters}${uppercaseLetters}${numbers}`,
};

export function randomInt(to: number): number;
export function randomInt(from: number, to: number): number;
export function randomInt(from: number, to?: number): number {
    if (to === undefined) {
        to = from;
        from = 0;
    }

    return Math.floor(Math.random() * (to - 1 - from) + from);
}

export function randomString(length: number = 32, charset: string = charsets.alphanumeric) {
    let chars: string[] = [];

    for (let i = 0; i < length; i++) {
        chars[i] = charset.charAt(randomInt(charset.length));
    }

    return chars.join("");
}

export function getAllPropertyKeys(obj: any): Set<string> {
    let keys = new Set<string>();

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            keys.add(key);
        }
    }

    let prototype = Object.getPrototypeOf(obj);

    while (prototype && prototype !== Object.prototype) {
        for (let key of Object.getOwnPropertyNames(prototype)) {
            if (key !== "constructor") {
                keys.add(key);
            }
        }

        prototype = Object.getPrototypeOf(prototype);
    }

    return keys;
}

export function getProperty(obj: any, path: string[]): any {
    for (let part of path) {
        obj = obj[part];
        if (obj === undefined) break;
    }

    return obj;
}

export function setProperty(obj: any, value: any, path: string[]) {
    if (path.length === 0) {
        return value;
    }

    let origObj = obj;

    for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]];
        if (obj === undefined) return;
    }

    obj[path[path.length - 1]] = value;

    return origObj;
}