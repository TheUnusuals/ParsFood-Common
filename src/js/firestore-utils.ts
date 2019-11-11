import {firestore} from "firebase/app";

export type DatabaseDocument = { [key: string]: any } & object;
export type DatabaseDocumentWithId = { id: string } & DatabaseDocument;

export type FirestoreObjectOptions = string | {
    collectionPath: string;
    name?: string;
    query?: (collection: firestore.CollectionReference) => firestore.Query;
    subcollections?: FirestoreObjectOptions[];
}

type NormalizedFirestoreObjectOptions = {
    collectionPath: string;
    name: string;
    query?: (collection: firestore.CollectionReference) => firestore.Query;
    subcollections: NormalizedFirestoreObjectOptions[];
}

let database: firestore.Firestore;

export function setFirestore(firestore: firestore.Firestore) {
    database = firestore;
}

export function getFirestore(): firestore.Firestore | undefined {
    return database;
}

function normalizeFirestoreObjectOptions(options: FirestoreObjectOptions): NormalizedFirestoreObjectOptions {
    if ((options as any).__normalized) return options as NormalizedFirestoreObjectOptions;

    return {
        collectionPath: typeof options === "string" ? options : options.collectionPath,
        name: typeof options === "string" ? options : options.name === undefined ? options.collectionPath : options.name,
        query: typeof options === "string" ? undefined : options.query,
        subcollections: typeof options === "string" || options.subcollections === undefined ? [] :
            options.subcollections.map(subcollection => normalizeFirestoreObjectOptions(subcollection)),
        __normalized: true
    } as NormalizedFirestoreObjectOptions;
}

async function loadDocument<T extends DatabaseDocumentWithId>(documentSnapshot: firestore.DocumentSnapshot, options: NormalizedFirestoreObjectOptions, db: firestore.Firestore = database): Promise<T> {
    let document: T = {
        id: documentSnapshot.id,
        ...documentSnapshot.data()
    } as any;

    for (let subcollectionOptions of options.subcollections) {
        subcollectionOptions = {
            ...subcollectionOptions,
            collectionPath: db.collection(options.collectionPath).doc(document.id).collection(subcollectionOptions.collectionPath).path
        };

        (document as any)[subcollectionOptions.name] = await getCollection(subcollectionOptions, db);
    }

    return document;
}

export async function getDocument<T extends DatabaseDocumentWithId>(id: string, options: FirestoreObjectOptions, db: firestore.Firestore = database): Promise<T> {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let documentSnapshot = await db.collection(normalizedOptions.collectionPath).doc(id).get();

    return loadDocument(documentSnapshot, normalizedOptions, db);
}

export async function getCollection<T extends DatabaseDocumentWithId>(options: FirestoreObjectOptions, db: firestore.Firestore = database): Promise<T[]> {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let query: firestore.Query = db.collection(normalizedOptions.collectionPath);

    if (normalizedOptions.query) {
        query = normalizedOptions.query(query as firestore.CollectionReference);
    }

    let collectionSnapshot = await query.get();
    let collection = [];

    for (let documentSnapshot of collectionSnapshot.docs) {
        collection.push(await loadDocument<T>(documentSnapshot, normalizedOptions, db));
    }

    return collection;
}

export function subscribeToDocument(id: string, options: FirestoreObjectOptions, onUpdate: (refPath: string[], snapshot: firestore.DocumentSnapshot | firestore.QuerySnapshot, isDocument: boolean) => void, onError?: (error: Error) => void, db: firestore.Firestore = database): () => void {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let subscriptions: Map<string, () => void> = new Map();
    let documentPath = db.collection(normalizedOptions.collectionPath).doc(id).path;

    subscriptions.set(documentPath, db.doc(documentPath).onSnapshot(documentSnapshot => {
        onUpdate([], documentSnapshot, true);
    }, onError));

    for (let subcollectionOptions of normalizedOptions.subcollections) {
        let options = {
            ...subcollectionOptions,
            collectionPath: db.doc(documentPath).collection(subcollectionOptions.collectionPath).path
        };

        subscriptions.set(options.collectionPath, subscribeToCollection(options, (subRefPath, subSnapshot) => {
            onUpdate([id, subcollectionOptions.collectionPath, ...subRefPath], subSnapshot, false);
        }, onError, db));
    }

    return () => {
        for (let unsubscribe of subscriptions.values()) {
            unsubscribe();
        }
    };
}

export function subscribeToCollection(options: FirestoreObjectOptions, onUpdate: (refPath: string[], snapshot: firestore.QuerySnapshot) => void, onError?: (error: Error) => void, db: firestore.Firestore = database): () => void {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let subscriptions: Map<string, () => void> = new Map();

    let query: firestore.Query = db.collection(normalizedOptions.collectionPath);

    if (normalizedOptions.query) {
        query = normalizedOptions.query(query as firestore.CollectionReference);
    }

    subscriptions.set(normalizedOptions.collectionPath, query.onSnapshot(snapshot => {
        onUpdate([], snapshot);

        for (let subcollectionOptions of normalizedOptions.subcollections) {
            for (let documentChange of snapshot.docChanges()) {
                let options = {
                    ...subcollectionOptions,
                    collectionPath: `${normalizedOptions.collectionPath}/${documentChange.doc.id}/${subcollectionOptions.collectionPath}`
                };

                if (documentChange.type === "added") {
                    let unsubscribe = subscriptions.get(options.collectionPath);
                    if (unsubscribe) unsubscribe();

                    subscriptions.set(options.collectionPath, subscribeToCollection(options, (subRefPath, subSnapshot) => {
                        onUpdate([documentChange.doc.id, subcollectionOptions.collectionPath, ...subRefPath], subSnapshot);
                    }, onError, db));
                } else if (documentChange.type === "removed") {
                    let unsubscribe = subscriptions.get(options.collectionPath);
                    if (unsubscribe) unsubscribe();
                    subscriptions.delete(options.collectionPath);
                }
            }
        }
    }, onError));

    return () => {
        for (let unsubscribe of subscriptions.values()) {
            unsubscribe();
        }
    };
}

type DocumentInfo<T extends DatabaseDocument> = { document: T; subcollectionsInfo: { key: keyof T; options: NormalizedFirestoreObjectOptions }[] };

function getPlainDocumentAndInfo<T extends DatabaseDocument, D extends DatabaseDocument | DatabaseDocumentWithId>(data: D, options: NormalizedFirestoreObjectOptions): DocumentInfo<T> {
    let document: T = {} as T;
    let subcollectionsInfo: { key: keyof T, options: NormalizedFirestoreObjectOptions }[] = [];

    for (let key in data) {
        if (data.hasOwnProperty(key) && key !== "id") {
            let subcollectionOptions = options.subcollections.find(subcollection => subcollection.name === key)

            if (subcollectionOptions) {
                subcollectionsInfo.push({
                    key: key,
                    options: subcollectionOptions
                });
            } else {
                let value = data[key];

                if (!["function", "symbol"].includes(typeof value)) {
                    document[key] = value as any;
                }
            }
        }
    }

    return {document, subcollectionsInfo};
}

async function addAllSubcollections<T extends DatabaseDocument | DatabaseDocumentWithId, D extends DatabaseDocument>(data: T, documentInfo: DocumentInfo<D>, documentReference: firestore.DocumentReference, db: firestore.Firestore = database) {
    for (let subcollectionInfo of documentInfo.subcollectionsInfo) {
        let subcollectionOptions = {
            ...subcollectionInfo.options,
            collectionPath: documentReference.collection(subcollectionInfo.options.collectionPath).path
        };

        await addCollection(data[subcollectionInfo.key as any], subcollectionOptions, db);
    }
}

export async function addDocument<T extends DatabaseDocument | DatabaseDocumentWithId>(data: T, options: FirestoreObjectOptions, db: firestore.Firestore = database): Promise<firestore.DocumentReference> {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);

    let documentInfo = getPlainDocumentAndInfo(data, normalizedOptions);
    let documentReference = await db.collection(normalizedOptions.collectionPath).add(documentInfo.document);

    await addAllSubcollections(data, documentInfo, documentReference);

    return documentReference;
}

export async function addCollection<T extends DatabaseDocument | DatabaseDocumentWithId>(collection: T[], options: FirestoreObjectOptions, db: firestore.Firestore = database): Promise<firestore.DocumentReference[]> {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let batch = db.batch();
    let documentsInfo: { data: T, reference: firestore.DocumentReference, info: DocumentInfo<T> }[] = [];

    for (let data of collection) {
        let documentInfo = getPlainDocumentAndInfo(data, normalizedOptions);
        let documentReference = db.collection(normalizedOptions.collectionPath).doc();

        batch.set(documentReference, documentInfo.document);

        documentsInfo.push({
            data: data,
            reference: documentReference,
            info: documentInfo as any
        });
    }

    await batch.commit();

    for (let {data, info, reference} of documentsInfo) {
        await addAllSubcollections(data, info, reference);
    }

    return documentsInfo.map(documentInfo => documentInfo.reference);
}

async function setAllSubcollections<T extends DatabaseDocumentWithId, D extends DatabaseDocument>(data: T, documentInfo: DocumentInfo<D>, documentReference: firestore.DocumentReference, db: firestore.Firestore = database) {
    for (let subcollectionInfo of documentInfo.subcollectionsInfo) {
        let subcollectionOptions = {
            ...subcollectionInfo.options,
            collectionPath: documentReference.collection(subcollectionInfo.options.collectionPath).path
        };

        await setCollection(data[subcollectionInfo.key as any], subcollectionOptions, db);
    }
}

export async function setDocument<T extends DatabaseDocumentWithId>(data: T, options: FirestoreObjectOptions, db: firestore.Firestore = database): Promise<firestore.DocumentReference> {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let documentInfo = getPlainDocumentAndInfo(data, normalizedOptions);
    let documentReference = db.collection(normalizedOptions.collectionPath).doc(data.id);

    await documentReference.set(documentInfo.document);
    await setAllSubcollections(data, documentInfo, documentReference);

    return documentReference;
}

export async function setCollection<T extends DatabaseDocumentWithId>(collection: T[], options: FirestoreObjectOptions, db: firestore.Firestore = database): Promise<firestore.DocumentReference[]> {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let batch = db.batch();
    let documentsInfo: { data: T, reference: firestore.DocumentReference, info: DocumentInfo<DatabaseDocument> }[] = [];

    for (let data of collection) {
        let documentInfo = getPlainDocumentAndInfo(data, normalizedOptions);
        let documentReference = db.collection(normalizedOptions.collectionPath).doc(data.id);

        batch.set(documentReference, documentInfo.document);

        documentsInfo.push({
            data: data,
            reference: documentReference,
            info: documentInfo as any
        });
    }

    await batch.commit();

    for (let {data, info, reference} of documentsInfo) {
        await setAllSubcollections(data, info, reference);
    }

    return documentsInfo.map(documentInfo => documentInfo.reference);
}

async function deleteAllSubcollections(documentReference: firestore.DocumentReference, options: NormalizedFirestoreObjectOptions) {
    for (let subcollectionOptions of options.subcollections) {
        subcollectionOptions = {
            ...subcollectionOptions,
            collectionPath: documentReference.collection(subcollectionOptions.collectionPath).path
        };

        await deleteCollection(subcollectionOptions);
    }
}

export async function deleteDocument(id: string, options: FirestoreObjectOptions, db: firestore.Firestore = database) {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let documentReference = db.collection(normalizedOptions.collectionPath).doc(id);

    await documentReference.delete();
    await deleteAllSubcollections(documentReference, normalizedOptions);
}

export async function deleteCollection(options: FirestoreObjectOptions, db: firestore.Firestore = database) {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let query: firestore.Query = db.collection(normalizedOptions.collectionPath);

    if (normalizedOptions.query) query = normalizedOptions.query(query as firestore.CollectionReference);

    let querySnapshot = await query.get();
    let batch = db.batch();

    for (let documentSnapshot of querySnapshot.docs) {
        batch.delete(documentSnapshot.ref);
    }

    await batch.commit();

    for (let documentSnapshot of querySnapshot.docs) {
        await deleteAllSubcollections(documentSnapshot.ref, normalizedOptions);
    }
}

function getObjectFromRefPath(object: any[] | any, isCollection: boolean, refPath: string[], options: NormalizedFirestoreObjectOptions) {
    let isRefId = isCollection;
    let collectionOptions: NormalizedFirestoreObjectOptions = options;
    let parent: any = null;
    let key: string | number | null = null;
    for (let ref of refPath) {
        if (isRefId) {
            parent = object;

            let found = false;

            for (let i = 0; i < object.length; i++) {
                let doc = object[i];

                if (doc.id === ref) {
                    object = doc;
                    key = i;
                    found = true;
                    break;
                }
            }

            if (!found) return null;
        } else {
            parent = object;
            key = collectionOptions.name;
            collectionOptions = collectionOptions.subcollections.find(opt => opt.collectionPath === ref)!;
            object = object[collectionOptions.name];

            if (!object) return null;
        }

        isRefId = !isRefId;
    }

    return {
        object: object,
        options: collectionOptions,
        parent: parent,
        key: key
    };
}

function applyDocumentChanges(document: any, snapshot: firestore.DocumentSnapshot, options: NormalizedFirestoreObjectOptions): any {
    let updatedDoc: any = {
        id: snapshot.id,
        ...snapshot.data()
    };

    for (let subcollection of options.subcollections) {
        updatedDoc[subcollection.name] = document && document[subcollection.name] !== undefined ? document[subcollection.name] : [];
    }

    return updatedDoc;
}

function applyCollectionChanges(collection: any[], snapshot: firestore.QuerySnapshot, options: NormalizedFirestoreObjectOptions) {
    for (let documentChange of snapshot.docChanges()) {
        if (documentChange.type === "added") {
            let doc = applyDocumentChanges(null, documentChange.doc, options);

            collection.splice(documentChange.newIndex, 0, doc);
        } else if (documentChange.type === "modified") {
            let updatedDocument = applyDocumentChanges(collection[documentChange.oldIndex], documentChange.doc, options);

            if (documentChange.oldIndex === documentChange.newIndex) {
                collection.splice(documentChange.oldIndex, 1, updatedDocument);
            } else {
                collection.splice(documentChange.oldIndex, 1);
                collection.splice(documentChange.newIndex, 0, updatedDocument);
            }
        } else if (documentChange.type === "removed") {
            collection.splice(documentChange.oldIndex, 1);
        }
    }
}

export function updateDocumentFromSnapshot<T extends object>(document: T, options: FirestoreObjectOptions, refPath: string[], snapshot: firestore.DocumentSnapshot | firestore.QuerySnapshot, isDocument: boolean): T {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let objectInfo = getObjectFromRefPath(document, false, refPath, normalizedOptions);

    if (!objectInfo) return document;

    if (isDocument) {
        let doc = applyDocumentChanges(objectInfo.object, snapshot as firestore.DocumentSnapshot, normalizedOptions);

        if (objectInfo.parent) {
            objectInfo.parent[objectInfo.key as any] = doc;
        } else {
            document = doc;
        }
    } else {
        applyCollectionChanges(objectInfo.object, snapshot as firestore.QuerySnapshot, objectInfo.options);
    }

    return document;
}

export function updateCollectionFromSnapshot<T extends object>(collection: T[], options: FirestoreObjectOptions, refPath: string[], snapshot: firestore.QuerySnapshot): T[] {
    let normalizedOptions = normalizeFirestoreObjectOptions(options);
    let objectInfo = getObjectFromRefPath(collection, true, refPath, normalizedOptions);

    if (!objectInfo) return collection;

    applyCollectionChanges(objectInfo.object, snapshot, objectInfo.options);

    return collection;
}