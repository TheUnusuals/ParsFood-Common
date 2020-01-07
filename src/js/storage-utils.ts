import {storage} from "firebase/app";
import {isStorageError} from "./firebase-utils";

let firebaseStorage: storage.Storage;

export function setStorage(storage: storage.Storage) {
    firebaseStorage = storage;
}

export async function storageFileExists(pathOrRef: string | storage.Reference): Promise<boolean> {
    const ref = typeof pathOrRef === "string" ? firebaseStorage.ref(pathOrRef) : pathOrRef;

    try {
        await ref.getMetadata();
    } catch (error) {
        if (isStorageError(error) && error.code === "storage/object-not-found")
            return false;
        throw error;
    }

    return true;
}

export async function deleteStorageFile(pathOrRef: string | storage.Reference): Promise<boolean> {
    const ref = typeof pathOrRef === "string" ? firebaseStorage.ref(pathOrRef) : pathOrRef;

    try {
        await ref.delete();
    } catch (error) {
        if (isStorageError(error) && error.code === "storage/object-not-found")
            return false;
        throw error;
    }

    return true;
}
