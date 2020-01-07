import firebase, {firestore, functions} from "firebase/app";

export function isHttpsError(error: any): error is functions.HttpsError {
    return error instanceof Object && error.code != null && error.message != null;
}

export function isFirestoreError(error: any): error is firestore.FirestoreError {
    return error instanceof Object && error.code != null && error.message != null && error.name != null;
}

export function isStorageError(error: any): error is firebase.FirebaseError {
    return error instanceof Object && error.message != null && error.name != null
        && error.code != null && error.code.startsWith("storage/");
}
