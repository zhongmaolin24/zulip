import $ from "jquery";
import * as tippy from "tippy.js";
import * as message_lists from "./message_lists";
import {LONG_HOVER_DELAY} from "./tippyjs";


// We need to store all message list instances together to destroy them in case of re-rendering.
const message_list_tippy_instances = new Set<tippy.Instance>();

// This keeps track of all the instances created and destroyed.
const store_message_list_instances_plugin = {
    fn() {
        return {
            onCreate(instance: tippy.Instance) {
                message_list_tippy_instances.add(instance);
            },
            onDestroy(instance: tippy.Instance) {
                // To make sure the `message_list_tippy_instances` contains only instances
                // that are present in the DOM, we need to delete instances that are destroyed
                message_list_tippy_instances.delete(instance);
            },
        };
    },
};

function message_list_tooltip(target: string, props: Partial<tippy.Props> = {}): void {
    const {onShow, ...other_props} = props;
    tippy.delegate("body", {
        target,
        appendTo: () => document.body,
        plugins: [store_message_list_instances_plugin],
        onShow(instance) {
            if (message_lists.current === undefined) {
                // Since tooltips is called with a delay, it is possible that the
                // message feed is not visible when the tooltip is shown.
                return false;
            }

            if (onShow !== undefined && onShow(instance) === false) {
                // Only return false if `onShow` returns false. We don't want to hide
                // tooltip if `onShow` returns `undefined`.
                return false;
            }

            return undefined;
        },
        ...other_props,
    });
}

export function initialize(): void {
    message_list_tooltip(".message_ai_bot_button", {
        delay: LONG_HOVER_DELAY,
        onShow(instance) {
            // Handle dynamic "starred messages" and "edit" widgets.
            const $elem = $(instance.reference);
            console.log($elem)
        },
        onHidden(instance) {
            instance.destroy();
        },
    });
}
