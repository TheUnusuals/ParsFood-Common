import Vue, {VueConstructor} from "vue";

export type Dependencies = {
    [id: string]: any;
};

declare module "vue/types/vue" {
    interface Vue {
        $dependencies: Dependencies;

        $provide(id: string, value: any): void;

        $inject(id: string): any | undefined;
    }
}

export default class DependencyPlugin {
    static install(Vue: VueConstructor) {
        Vue.mixin({
            beforeCreate() {
                this.$dependencies = Vue.observable({});
            }
        });

        Vue.prototype.$provide = function (this: Vue, id: string, value: any): void {
            this.$set(this.$dependencies, id, value);
        };

        Vue.prototype.$inject = function (this: Vue, id: string): any | undefined {
            let root = this.$parent;
            while (root) {
                if (root.$dependencies && root.$dependencies[id]) return root.$dependencies[id];
                root = root.$parent;
            }
            return;
        };
    }
}
