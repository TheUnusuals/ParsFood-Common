export const proxyTargetSymbol = Symbol("proxy value");
export const proxyIdProperty = "__proxy_id";

type NonEnumerableProxy<T extends object, ID = any> = T & {
    [proxyTargetSymbol]: T,
    [proxyIdProperty]: ID
};

export function createNonEnumerableProxy<T extends object, ID = any>(obj: T, id: ID): NonEnumerableProxy<T, ID> {
    const proxyPublicProps = [
        proxyIdProperty
    ];

    const proxyProps: NonEnumerableProxy<{}> = {
        [proxyTargetSymbol]: obj,
        [proxyIdProperty]: id
    };

    let targetProxy: T = {} as T;

    return new Proxy(targetProxy, {
        get(target: T, property: string | number | symbol, receiver: any): any {
            if (property in proxyProps)
                return (proxyProps as any)[property];
            return (obj as any)[property];
        },
        set(target: T, property: string | number | symbol, value: any, receiver: any): boolean {
            if (property in proxyProps)
                return false;
            (obj as any)[property] = value;
            return true;
        },
        ownKeys(target: T): PropertyKey[] {
            return proxyPublicProps.map(prop => prop);
        },
        has(target: T, property: string | number | symbol): boolean {
            return proxyPublicProps.includes(property as any);
        },
        getOwnPropertyDescriptor(target: T, property: string | number | symbol): PropertyDescriptor | undefined {
            if (proxyPublicProps.includes(property as any)) {
                return {
                    configurable: true,
                    enumerable: true,
                    writable: false,
                    value: (proxyProps as any)[property]
                };
            }
            return Object.getOwnPropertyDescriptor(obj, property);
        },
        // forward everything else to obj
        getPrototypeOf(target: T): object | null {
            return Object.getPrototypeOf(obj);
        },
        setPrototypeOf(target: T, value: any): boolean {
            Object.setPrototypeOf(obj, value);
            return true;
        },
        isExtensible(target: T): boolean {
            return Object.isExtensible(obj);
        },
        preventExtensions(target: T): boolean {
            Object.preventExtensions(obj);
            return true;
        },
        defineProperty(target: T, property: string | number | symbol, attributes: PropertyDescriptor): boolean {
            Object.defineProperty(obj, property, attributes);
            return true;
        },
        deleteProperty(target: T, property: string | number | symbol): boolean {
            delete (obj as any)[property];
            return true;
        },
        apply(target: T, thisArg: any, argArray?: any): any {
            return (obj as any).apply(thisArg, argArray);
        },
        construct(target: T, argArray: any, newTarget?: any): object {
            return new (obj as any)(...argArray);
        }
    }) as NonEnumerableProxy<T, ID>;
}

export function isProxy<T extends object, ID = any>(obj: T): obj is NonEnumerableProxy<T, ID> {
    return (obj as any)[proxyTargetSymbol] !== undefined;
}

export function isProxyWithoutTarget<T extends object>(obj: T): boolean {
    return (obj as any)[proxyIdProperty] !== undefined && (obj as any)[proxyTargetSymbol] === undefined;
}

export function getProxyId<T extends object, ID = any>(obj: NonEnumerableProxy<T, ID>): ID {
    return obj[proxyIdProperty];
}

export function getProxyTarget<T extends object>(proxy: NonEnumerableProxy<T> | T): T {
    let target: T = (proxy as any)[proxyTargetSymbol];
    return target === undefined ? proxy : target;
}