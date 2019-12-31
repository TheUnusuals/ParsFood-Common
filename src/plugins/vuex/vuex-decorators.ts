import "reflect-metadata";
import {
    ActionContext as Context,
    CommitOptions,
    DispatchOptions,
    GetterTree,
    Module,
    Module as Mod,
    Payload,
    Store
} from "vuex";
import {createNonEnumerableProxy, getProxyId, isProxy, isProxyWithoutTarget} from "../../js/proxy";
import {getAllPropertyKeys, getProperty, randomString, setProperty} from "../../js/utils";

const symbols = {
    state: Symbol("state"),
    getter: Symbol("getter"),
    mutation: Symbol("mutation"),
    action: Symbol("action"),

    vuexModule: Symbol("VuexModule"),
};

export const initModuleAction = "__initVuexModule__";

export function State<T extends VuexModule>(name?: string): (target: T, propertyName: string) => void;
export function State<T extends VuexModule>(target: T, propertyName: string): void;
export function State<T extends VuexModule>(name?: string | T, propertyName?: string) {
    if (typeof propertyName === "string") {
        StateDecorator()(name as T, propertyName);
    } else {
        return StateDecorator(name as string);
    }
}

function StateDecorator<T extends VuexModule>(name?: string) {
    return (target: T, propertyName: string) => {
        if (name === undefined) name = propertyName;
        Reflect.defineMetadata(symbols.state, name, target, propertyName);
    }
}

type GetterSettings = {
    name: string;
    propertyDescriptor: PropertyDescriptor;
}

export function Getter<T extends VuexModule>(name?: string): (target: T, propertyName: string, propertyDescriptor: PropertyDescriptor) => void;
export function Getter<T extends VuexModule>(target: T, propertyName: string, propertyDescriptor: PropertyDescriptor): void;
export function Getter<T extends VuexModule>(name?: string | T, propertyName?: string, propertyDescriptor?: PropertyDescriptor) {
    if (typeof propertyName === "string") {
        GetterDecorator()(name as T, propertyName, propertyDescriptor!);
    } else {
        return GetterDecorator(name as string);
    }
}

function GetterDecorator<T extends VuexModule>(name?: string) {
    return (target: T, propertyName: string, propertyDescriptor: PropertyDescriptor) => {
        if (name === undefined) name = propertyName;
        Reflect.defineMetadata(symbols.getter, {name, propertyDescriptor}, target, propertyName);
    }
}

export function Mutation<T extends VuexModule>(name?: string): (target: T, propertyName: string, propertyDescriptor: TypedPropertyDescriptor<(...args: any[]) => void>) => void;
export function Mutation<T extends VuexModule>(target: T, propertyName: string, propertyDescriptor: TypedPropertyDescriptor<(...args: any[]) => void>): void;
export function Mutation<T extends VuexModule>(name?: string | T, propertyName?: string, propertyDescriptor?: TypedPropertyDescriptor<(...args: any[]) => void>) {
    if (typeof propertyName === "string") {
        MutationDecorator()(name as T, propertyName, propertyDescriptor!);
    } else {
        return MutationDecorator(name as string);
    }
}

function MutationDecorator<T extends VuexModule>(name?: string) {
    return (target: T, propertyName: string, propertyDescriptor: TypedPropertyDescriptor<(...args: any[]) => void>) => {
        if (name === undefined) name = propertyName;
        Reflect.defineMetadata(symbols.mutation, name, target, propertyName);
    }
}

export interface ActionContext<State = any, RootState = any> extends Context<State, RootState> {
}

export interface ActionOptions {
    name?: string;
    root?: boolean;
}

interface ActionSettings {
    name: string;
    root: boolean;
}

export function Action<T extends VuexModule>(options?: ActionOptions):
    (target: T, propertyName: string, propertyDescriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => void;
export function Action<T extends VuexModule>(target: T, propertyName: string, propertyDescriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>): void;
export function Action<T extends VuexModule>(options?: ActionOptions | T, propertyName?: string, propertyDescriptor?: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) {
    if (typeof propertyName === "string") {
        ActionDecorator()(options as T, propertyName, propertyDescriptor!);
    } else {
        return ActionDecorator(options as ActionOptions);
    }
}

function ActionDecorator<T extends VuexModule>(actionOptions?: ActionOptions) {
    return (target: T, propertyName: string, propertyDescriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => {
        if (actionOptions === undefined) actionOptions = {};
        if (actionOptions.name === undefined) actionOptions.name = propertyName;
        if (actionOptions.root === undefined) actionOptions.root = false;
        Reflect.defineMetadata(symbols.action, actionOptions, target, propertyName);
    }
}

function isJsonIncompatible<T extends object>(obj: T): boolean {
    let prototype = Object.getPrototypeOf(obj);

    if (Array.isArray(obj)) return false;
    if (prototype !== Object.prototype) return true;
    if (Object.getOwnPropertySymbols(obj).length > 0) return true;

    let isObservable = (obj as any).__ob__;
    let propertyDescriptors = Object.getOwnPropertyDescriptors(obj);

    for (let key in propertyDescriptors) {
        if (key !== "__ob__") {
            let descriptor = propertyDescriptors[key];

            if (descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false || !isObservable && (descriptor.get || descriptor.set) ||
                !["undefined", "boolean", "number", "string", "object"].includes(typeof descriptor.value)) {
                return true;
            }
        }
    }

    return false;
}

function generateProxyId(oldProxyObjects: Map<string, any>, newProxyObjects: Map<string, any>): string {
    let triesLeft = 100;

    do {
        let id = randomString(32);
        if (!oldProxyObjects.has(id) && !newProxyObjects.has(id)) return id;
        triesLeft--;
    } while (triesLeft > 0);

    throw new Error("Cannot generate a unique proxy id.");
}

function initProxiesRecursively<T>(obj: T, oldProxyObjects: Map<string, any>, newProxyObjects: Map<string, any>): T {
    if (obj !== null && typeof obj === "object") {
        if (isProxy(obj as any)) {
            newProxyObjects.set(getProxyId(obj as any), obj);
            return obj;
        } else if (isProxyWithoutTarget(obj as any)) {
            let id = getProxyId(obj as any);
            let proxy = oldProxyObjects.get(id);
            newProxyObjects.set(id, proxy);
            return proxy;
        } else if (isJsonIncompatible(obj as any)) {
            let id = generateProxyId(oldProxyObjects, newProxyObjects);
            let proxy = createNonEnumerableProxy(obj as any, id);
            newProxyObjects.set(id, proxy);
            return proxy;
        }

        for (let key of Object.getOwnPropertyNames(obj)) {
            let oldValue = (obj as any)[key];
            let newValue = initProxiesRecursively(oldValue, oldProxyObjects, newProxyObjects);

            if (newValue !== oldValue) {
                (obj as any)[key] = newValue;
            }
        }
    }

    return obj;
}

function wrapState<State>(module: VuexModule<State>): State {
    return {
        [symbols.vuexModule]: module
    } as any;
}

export abstract class VuexModule<State = any, RootState = any> {

    namespace?: string;

    enableProxyWatcher: boolean = false;

    module: Mod<State, RootState> = {};

    state: State = {} as State;

    getters: GetterTree<State, RootState> = {};

    rootState: RootState = {} as RootState;
    rootGetters: GetterTree<RootState, RootState> = {};

    context!: ActionContext<State, RootState>;
    store!: Store<RootState>;

    private _vuexModuleInitialized: boolean = false;
    private _proxyObjects: Map<string, any> = new Map();

    get namespacePrefix(): string {
        return this.namespace === undefined ? "" : this.namespace + "/";
    }

    get contextNamespacePrefix(): string {
        return this.module.namespaced ? "" : this.namespacePrefix;
    }

    get stateStorePath(): string[] {
        return this.namespace === undefined ? [] : this.namespace.split("/");
    }

    protected constructor() {
    }

    init() {
    }

    protected initVuexModule(this: VuexModule<State, RootState> & { [key: string]: any }) {
        if (this._vuexModuleInitialized) return;
        this._vuexModuleInitialized = true;

        if (this.module.namespaced === undefined) this.module.namespaced = true;
        if (this.module.getters === undefined) this.module.getters = {};
        if (this.module.mutations === undefined) this.module.mutations = {};
        if (this.module.actions === undefined) this.module.actions = {};
        if (this.module.modules === undefined) this.module.modules = {};

        if (this.state === undefined) this.state = {} as State;

        this.module.actions[initModuleAction] = {
            root: true,
            handler: (context: ActionContext<State, RootState>, store: Store<RootState>) => {
                this.context = context;
                this.store = store;

                this.getters = this.context.getters;

                this.rootState = this.context.rootState;
                this.rootGetters = this.context.rootGetters;

                this.store.subscribe((mutation, state) => {
                    let mutationPrefix = this.module.namespaced ? this.namespacePrefix : "";
                    let unprefixedMutation = mutation.type.substring(mutationPrefix.length);
                    let mutationFunc: any = this.module.mutations![unprefixedMutation];

                    if (mutationFunc) {
                        this.initProxyObjects();
                    }
                });

                Object.defineProperty(this, "state", {
                    configurable: true,
                    enumerable: true,
                    get: (): State => {
                        return getProperty(this.store.state, this.stateStorePath);
                    },
                    set: (newState: State) => {
                        let path = this.stateStorePath;

                        if (path.length === 0) {
                            this.store.replaceState(newState as any);
                        } else {
                            setProperty(this.store.state, newState, path);
                        }

                        this.initProxyObjects();
                    }
                });

                if (this.enableProxyWatcher) {
                    this.store.watch((state, getters): State => {
                        return this.state;
                    }, (value: State, oldValue: State) => {
                        this.initProxyObjects();
                    }, {
                        immediate: true,
                        deep: true
                    });
                }
            }
        };

        for (let propertyName of getAllPropertyKeys(this)) {
            const isState: string | undefined = Reflect.getMetadata(symbols.state, this, propertyName);
            const isGetter: GetterSettings | undefined = Reflect.getMetadata(symbols.getter, this, propertyName);
            const isMutation: string | undefined = Reflect.getMetadata(symbols.mutation, this, propertyName);
            const isAction: ActionSettings | undefined = Reflect.getMetadata(symbols.action, this, propertyName);

            if (isState !== undefined) {
                (this.state as any)[isState] = this[propertyName];

                Object.defineProperty(this, propertyName, {
                    configurable: true,
                    enumerable: true,
                    get: () => {
                        return (this.state as any)[isState];
                    },
                    set: (value: any) => {
                        (this.state as any)[isState] = value;
                    }
                });
            } else if (isGetter && isGetter.propertyDescriptor.get) {
                const getter = isGetter.propertyDescriptor.get;

                Object.defineProperty(this, propertyName, {
                    ...isGetter.propertyDescriptor,
                    get: () => this.context.getters[isGetter.name]
                });

                this.module.getters![isGetter.name] = (state: State, getters: GetterTree<State, RootState>, rootState: RootState, rootGetters: GetterTree<RootState, RootState>) => {
                    return getter.call(this);
                }
            } else if (isMutation !== undefined && typeof this[propertyName] === "function") {
                const mutator: (...args: any[]) => any = this[propertyName] as any;
                const namespacedPropertyName = this.contextNamespacePrefix + isMutation;

                Object.defineProperty(this, propertyName, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: (...args: any[]): any => {
                        return this.context.commit(namespacedPropertyName, args);
                    }
                });

                this.module.mutations![isMutation] = (state: State, args: any[]): any => {
                    return mutator.apply(this, args);
                }
            } else if (isAction && typeof this[propertyName] === "function") {
                const action: (...args: any[]) => void | Promise<any> = this[propertyName] as any;
                const namespacedPropertyName = (isAction.root ? "" : this.contextNamespacePrefix) + isAction.name;

                Object.defineProperty(this, propertyName, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: (...args: any[]): any => {
                        return this.context.dispatch(namespacedPropertyName, args);
                    }
                });

                this.module.actions![isAction.name] = (context: ActionContext<State, RootState>, args: any[]): Promise<any> => {
                    return action.apply(this, args) as any;
                }
            }
        }
    }

    commit<P>(type: string, payload?: P, options?: CommitOptions): void;
    commit<P extends Payload>(payloadWithType: P, options?: CommitOptions): void;
    commit(type: string, payload?: any, options?: CommitOptions): void {
        this.context.commit(type, payload, options);
    }

    dispatch<P, R = any>(type: string, payload?: P, options?: DispatchOptions): Promise<R>;
    dispatch<P extends Payload, R = any>(payloadWithType: P, options?: DispatchOptions): Promise<R>;
    dispatch(type: string, payload?: any, options?: DispatchOptions): Promise<any> {
        return this.context.dispatch(type, payload, options);
    }

    getModule(): Mod<State, RootState> {
        return {
            ...this.module,
            state: wrapState(this)
        };
    }

    initProxyObjects() {
        (this.store as any)._withCommit(() => {
            let newProxyObjects: Map<string, any> = process.env.NODE_ENV === "production" ? new Map() : this._proxyObjects;
            let oldState = this.state;
            let newState = initProxiesRecursively(oldState, this._proxyObjects, newProxyObjects);

            if (process.env.NODE_ENV === "production")
                this._proxyObjects = newProxyObjects;

            if (newState !== oldState) {
                this.state = newState;
            }
        });
    }

}

function unwrapStateRecursively(obj: any, namespace: string | undefined, modules: VuexModule[]): any {
    if (["object", "function"].includes(typeof obj) && obj !== null) {
        let vuexModule: VuexModule | undefined = obj[symbols.vuexModule];

        if (vuexModule) {
            if (vuexModule.namespace === undefined) {
                vuexModule.namespace = namespace;
            }

            modules.push(vuexModule);

            return vuexModule.state = unwrapStateRecursively(vuexModule.state, namespace, modules);
        } else {
            for (let propertyName in obj) {
                if (obj.hasOwnProperty(propertyName)) {
                    let propertyNamespace = namespace === undefined ? propertyName : namespace + "/" + propertyName;
                    let oldValue = obj[propertyName];
                    let newValue = unwrapStateRecursively(oldValue, propertyNamespace, modules);

                    if (newValue !== oldValue) {
                        obj[propertyName] = newValue;
                    }
                }
            }

            return obj;
        }
    }

    return obj;
}

export default async function VuexDecoratorsPlugin(store: Store<any>) {
    let modules: VuexModule[] = [];

    let unwrapStateModule: Module<any, any> = {
        mutations: {
            __VuexModule_unwrapState() {
                let unwrappedState = unwrapStateRecursively(store.state, undefined, modules);
                store.replaceState(unwrappedState);
            }
        }
    };

    let unwrapStateModuleId = randomString(32);

    store.registerModule(unwrapStateModuleId, unwrapStateModule, {
        preserveState: true
    });

    store.commit("__VuexModule_unwrapState");

    store.unregisterModule(unwrapStateModuleId);

    await store.dispatch(initModuleAction, store);

    for (let module of modules) {
        module.init();
    }
}
