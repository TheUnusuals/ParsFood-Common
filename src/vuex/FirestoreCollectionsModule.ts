import {firestore} from "firebase/app";
import {Getter, Mutation, State, VuexModule} from "../plugins/vuex/vuex-decorators";
import {FirestoreObjectOptions, subscribeToCollection, updateCollectionFromSnapshot} from "../js/firestore-utils";

export type FirestoreCollectionsModuleState<T> = {
    collections: Record<string, CollectionSyncedList<T>>;
};

export interface CollectionSyncedList<T> {
    list: T[];
    syncEnabled: boolean;
    syncing: boolean;
}

interface CollectionSubscriber {
    onError?: (error: any) => void;
}

interface CollectionsInfo {
    unsubscribeFromSync?: () => void;
    firstSync: boolean;
    collectionSubscribers: CollectionSubscriber[];
    unsubscribeFromCollectionOptions?: () => void;
}

export default class FirestoreCollectionsModule<T extends object, ModuleState extends FirestoreCollectionsModuleState<T> = any, RootState = any> extends VuexModule<ModuleState, RootState> {

    @State collections: Record<string, CollectionSyncedList<T>> = {};

    protected collectionsInfo: Record<string, CollectionsInfo> = {};

    @Getter
    get collectionOptions(): Record<string, FirestoreObjectOptions> {
        const options: Record<string, FirestoreObjectOptions> = {};

        for (let collectionPath of Object.keys(this.collections)) {
            options[collectionPath] = this.mapCollectionOptions(collectionPath);
        }

        return options;
    }

    protected constructor() {
        super();
    }

    protected unsubscribeWaitTime: number = 5000;

    protected mapCollectionOptions(collectionPath: string): FirestoreObjectOptions {
        return collectionPath;
    }

    protected syncCollection(collectionPath: string, onError?: (error: any) => void): () => void {
        let collection = this.collections[collectionPath];
        let collectionInfo = this.collectionsInfo[collectionPath];

        if (!collection || !collection.syncEnabled || collectionInfo.collectionSubscribers.length === 0) {
            this.startCollectionSync(collectionPath);
            collectionInfo = this.collectionsInfo[collectionPath];
        }

        const subscriber: CollectionSubscriber = {onError: onError};

        const unsubscribe = () => {
            setTimeout(() => {
                const collectionInfo = this.collectionsInfo[collectionPath];

                if (collectionInfo) {
                    let index = collectionInfo.collectionSubscribers.indexOf(subscriber);
                    if (index !== -1) collectionInfo.collectionSubscribers.splice(index, 1);
                    if (collectionInfo.collectionSubscribers.length === 0) this.stopCollectionSync(collectionPath);
                }
            }, this.unsubscribeWaitTime);
        };

        collectionInfo.collectionSubscribers.push(subscriber);

        return unsubscribe;
    }

    protected startCollectionSync(collectionPath: string) {
        let collection = this.collections[collectionPath];

        if (!collection)
            this.createCollection(collectionPath);

        collection = this.collections[collectionPath];
        const collectionInfo = this.collectionsInfo[collectionPath];

        if (!collection.syncEnabled) {
            collectionInfo.firstSync = true;
            collectionInfo.unsubscribeFromSync = subscribeToCollection(
                this.collectionOptions[collectionPath],
                (refPath: string[], snapshot: firestore.QuerySnapshot) => {
                    this.updateCollectionFromSnapshot(collectionPath, refPath, snapshot);
                },
                (error) => {
                    const collectionInfo = this.collectionsInfo[collectionPath];

                    this.stopCollectionSync(collectionPath);

                    if (collectionInfo) {
                        for (let subscriber of collectionInfo.collectionSubscribers) {
                            subscriber.onError?.(error);
                        }

                        this.clearCollectionSubscribers(collectionPath);
                    }
                }
            );
            this.setSyncStatus(collectionPath, true, true);
        }

        collectionInfo.unsubscribeFromCollectionOptions = this.store.watch(
            () => this.collectionOptions[collectionPath],
            () => {
                const collection = this.collections[collectionPath];

                if (collection && collection.syncEnabled) {
                    this.stopCollectionSync(collectionPath);
                    this.startCollectionSync(collectionPath);
                }
            }
        );

        return collection;
    }

    protected stopCollectionSync(collectionPath: string, resetCollection?: boolean) {
        const collection = this.collections[collectionPath];
        const collectionInfo = this.collectionsInfo[collectionPath];

        if (collection && collection.syncEnabled) {
            if (collectionInfo.unsubscribeFromSync) {
                collectionInfo.unsubscribeFromSync();
                delete collectionInfo.unsubscribeFromSync;
            }

            if (collectionInfo.unsubscribeFromCollectionOptions) {
                collectionInfo.unsubscribeFromCollectionOptions();
                delete collectionInfo.unsubscribeFromCollectionOptions;
            }

            this.setSyncStatus(collectionPath, false, false, resetCollection);
        }
    }

    @Mutation
    protected createCollection(collectionPath: string) {
        this.collectionsInfo[collectionPath] = {
            firstSync: false,
            collectionSubscribers: []
        };

        this.collections = {
            ...this.collections,
            [collectionPath]: {
                list: [],
                syncEnabled: false,
                syncing: false
            } as CollectionSyncedList<T>
        };
    }

    @Mutation
    protected updateCollectionFromSnapshot(collectionPath: string, refPath: string[], snapshot: firestore.QuerySnapshot) {
        const collection = this.collections[collectionPath];
        const collectionInfo = this.collectionsInfo[collectionPath];

        if (collection) {
            collection.list = updateCollectionFromSnapshot(
                collectionInfo.firstSync ? [] : collection.list,
                this.collectionOptions[collectionPath],
                refPath,
                snapshot
            );

            collectionInfo.firstSync = false;
            collection.syncing = false;
        }
    }

    @Mutation
    protected setSyncStatus(collectionPath: string, enabled: boolean, syncing: boolean, resetCollection: boolean = false) {
        const collection = this.collections[collectionPath];

        if (collection) {
            collection.syncEnabled = enabled;
            collection.syncing = syncing;

            if (resetCollection) {
                delete this.collections[collectionPath];
                delete this.collectionsInfo[collectionPath];
            }
        }
    }

    @Mutation
    protected clearCollectionSubscribers(collectionPath: string) {
        const collectionInfo = this.collectionsInfo[collectionPath];

        if (collectionInfo) {
            collectionInfo.collectionSubscribers = [];
        }
    }

}
