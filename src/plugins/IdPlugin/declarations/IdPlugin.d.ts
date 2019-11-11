import Vue, {ComponentOptions} from "vue";

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