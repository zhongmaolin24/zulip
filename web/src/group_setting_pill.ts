import assert from "minimalistic-assert";

import render_input_pill from "../templates/input_pill.hbs";

import * as group_permission_settings from "./group_permission_settings";
import * as input_pill from "./input_pill";
import type {InputPillConfig} from "./input_pill";
import * as people from "./people";
import * as pill_typeahead from "./pill_typeahead";
import type {GroupSettingPill, GroupSettingPillContainer} from "./typeahead_helper";
import * as user_group_pill from "./user_group_pill";
import type {UserGroupPill} from "./user_group_pill";
import * as user_groups from "./user_groups";
import type {UserGroup} from "./user_groups";
import * as user_pill from "./user_pill";
import type {UserPill} from "./user_pill";

function check_group_allowed_for_setting(
    group_item: UserGroupPill,
    setting_name: string,
    setting_type: "realm" | "stream" | "group",
): boolean {
    const group_setting_config = group_permission_settings.get_group_permission_setting_config(
        setting_name,
        setting_type,
    );

    assert(group_setting_config !== undefined);

    const group = user_groups.get_user_group_from_id(group_item.group_id);
    if (!group.is_system_group) {
        if (group_setting_config.require_system_group) {
            return false;
        }

        return true;
    }

    return user_groups.check_system_user_group_allowed_for_setting(
        group.name,
        group_setting_config,
        true,
    );
}

function check_user_allowed_for_setting(
    user_item: UserPill,
    setting_name: string,
    setting_type: "realm" | "stream" | "group",
): boolean {
    const group_setting_config = group_permission_settings.get_group_permission_setting_config(
        setting_name,
        setting_type,
    );
    assert(group_setting_config !== undefined);

    if (group_setting_config.allow_everyone_group) {
        return true;
    }

    const user = people.get_by_email(user_item.email);
    return user !== undefined && !user.is_guest;
}

export function create_item_from_text(
    text: string,
    current_items: GroupSettingPill[],
    pill_config?: InputPillConfig,
): GroupSettingPill | undefined {
    const setting_name = pill_config?.setting_name;
    assert(setting_name !== undefined);
    const setting_type = pill_config?.setting_type;
    assert(setting_type !== undefined);

    const group_item = user_group_pill.create_item_from_group_name(text, current_items);
    if (group_item) {
        if (check_group_allowed_for_setting(group_item, setting_name, setting_type)) {
            return group_item;
        }

        return undefined;
    }

    const user_item = user_pill.create_item_from_email(text, current_items);
    if (user_item) {
        if (check_user_allowed_for_setting(user_item, setting_name, setting_type)) {
            return user_item;
        }
        return undefined;
    }

    return undefined;
}

export function get_text_from_item(item: GroupSettingPill): string {
    let text: string;
    switch (item.type) {
        case "user_group":
            text = user_group_pill.get_group_name_from_item(item);
            break;
        case "user":
            text = user_pill.get_email_from_item(item);
            break;
    }
    return text;
}

export function get_display_value_from_item(item: GroupSettingPill): string {
    if (item.type === "user_group") {
        return user_group_pill.display_pill(user_groups.get_user_group_from_id(item.group_id));
    }
    assert(item.type === "user");
    return user_pill.get_display_value_from_item(item);
}

export function generate_pill_html(item: GroupSettingPill): string {
    if (item.type === "user_group") {
        return render_input_pill({
            display_value: get_display_value_from_item(item),
            group_id: item.group_id,
        });
    }
    assert(item.type === "user");
    return user_pill.generate_pill_html(item);
}

export function create_pills(
    $pill_container: JQuery,
    setting_name: string,
    setting_type: "realm" | "stream" | "group",
): GroupSettingPillContainer {
    const pill_widget = input_pill.create<GroupSettingPill>({
        $container: $pill_container,
        create_item_from_text,
        get_text_from_item,
        get_display_value_from_item,
        generate_pill_html,
        pill_config: {
            setting_name,
            setting_type,
        },
    });
    return pill_widget;
}

export function set_up_pill_typeahead({
    pill_widget,
    $pill_container,
    opts,
}: {
    pill_widget: GroupSettingPillContainer;
    $pill_container: JQuery;
    opts: {
        setting_name: string;
        setting_type: "realm" | "stream" | "group";
        group?: UserGroup | undefined;
    };
}): void {
    pill_typeahead.set_up_group_setting_typeahead(
        $pill_container.find(".input"),
        pill_widget,
        opts,
    );
}
