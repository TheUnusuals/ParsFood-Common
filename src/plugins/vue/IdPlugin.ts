import Vue, {VueConstructor} from "vue";
import {randomString} from "../../js/utils";

declare module "vue/types/vue" {
    interface Vue {
        $componentId?: string;

        $id(field?: string): string;
    }
}

declare module "vue/types/options" {
    interface ComponentOptions<V extends Vue> {
        componentId?: string | true;
    }
}

export default class IdPlugin {
    private componentIds: Map<string, number> = new Map();

    getComponentName(name: string | true): string {
        if (name === true) {
            let triesLeft = 100;
            do {
                name = randomString(8);
                triesLeft--;
            } while (triesLeft > 0 && this.componentIds.has(name));
        }

        return name;
    }

    generateId(component: string): string {
        let id: number = 0;
        let lastId = this.componentIds.get(component);

        if (lastId !== undefined) {
            id = lastId + 1;
        }

        this.componentIds.set(component, id);

        return component + id;
    }

    static install(Vue: VueConstructor) {
        const idPlugin = new IdPlugin();

        Vue.mixin({
            beforeCreate() {
                let componentName = this.$options.componentId;

                if (componentName !== undefined) {
                    componentName = idPlugin.getComponentName(componentName);
                    this.$componentId = idPlugin.generateId(componentName);
                }
            }
        });

        Vue.prototype.$id = function (this: Vue, field?: string) {
            let hasComponentId = this.$componentId !== undefined;
            let hasField = field !== undefined;
            return (hasComponentId ? this.$componentId : "") + (hasComponentId && hasField ? "-" : "") + (hasField ? field : "");
        };
    }
}
