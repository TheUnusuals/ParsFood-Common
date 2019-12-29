import {functions, firestore} from "firebase";

export function isHttpsError(error: any): error is functions.HttpsError {
    return error instanceof Object && error.code != null && error.message != null;
}

export function isFirestoreError(error: any): error is firestore.FirestoreError {
    return error instanceof Object && error.code != null && error.message != null && error.name != null;
}
