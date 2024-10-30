import assert from "minimalistic-assert";

import * as group_permission_settings from "./group_permission_settings";
import {page_params} from "./page_params";
import * as settings_config from "./settings_config";
import {current_user, realm} from "./state_data";
import type {GroupSettingValue} from "./state_data";
import * as user_groups from "./user_groups";
import {user_settings} from "./user_settings";

let user_join_date: Date;
export function initialize(current_user_join_date: Date): void {
    // We keep the `user_join_date` as the present day's date if the user is a spectator
    user_join_date = current_user_join_date;
}

/*
    This is a close cousin of settings_config,
    but this has a bit more logic, and we
    ensure 100% line coverage on it.

    Our main goal with this code is to isolate
    some key modules from having to know
    about page_params and settings_config details.
*/

export function user_can_change_name(): boolean {
    if (current_user.is_admin) {
        return true;
    }
    if (realm.realm_name_changes_disabled || realm.server_name_changes_disabled) {
        return false;
    }
    return true;
}

export function user_can_change_avatar(): boolean {
    if (current_user.is_admin) {
        return true;
    }
    if (realm.realm_avatar_changes_disabled || realm.server_avatar_changes_disabled) {
        return false;
    }
    return true;
}

export function user_can_change_email(): boolean {
    if (current_user.is_admin) {
        return true;
    }
    if (realm.realm_email_changes_disabled) {
        return false;
    }
    return true;
}

export function user_can_change_logo(): boolean {
    return current_user.is_admin && realm.zulip_plan_is_not_limited;
}

function user_has_permission(policy_value: number): boolean {
    /* At present, nobody is not present in common_policy_values,
     * but we include a check for it here, so that code using
     * email_invite_to_realm_policy_values or other supersets can
     * use this function. */
    if (policy_value === settings_config.email_invite_to_realm_policy_values.nobody.code) {
        return false;
    }

    if (current_user.is_admin) {
        return true;
    }

    if (page_params.is_spectator || current_user.is_guest) {
        return false;
    }

    if (policy_value === settings_config.common_policy_values.by_admins_only.code) {
        return false;
    }

    if (current_user.is_moderator) {
        return true;
    }

    if (policy_value === settings_config.common_policy_values.by_moderators_only.code) {
        return false;
    }

    if (policy_value === settings_config.common_policy_values.by_members.code) {
        return true;
    }

    const current_datetime = new Date();
    const person_date_joined = new Date(user_join_date);
    const user_join_days =
        (current_datetime.getTime() - person_date_joined.getTime()) / 1000 / 86400;
    return user_join_days >= realm.realm_waiting_period_threshold;
}

export function user_has_permission_for_group_setting(
    setting_group_id: GroupSettingValue,
    setting_name: string,
    setting_type: "realm" | "stream" | "group",
): boolean {
    if (page_params.is_spectator) {
        return false;
    }

    const settings_config = group_permission_settings.get_group_permission_setting_config(
        setting_name,
        setting_type,
    );
    assert(settings_config !== undefined);

    if (!settings_config.allow_everyone_group && current_user.is_guest) {
        return false;
    }

    return user_groups.is_user_in_setting_group(setting_group_id, current_user.user_id);
}

export function user_can_invite_users_by_email(): boolean {
    return user_has_permission(realm.realm_invite_to_realm_policy);
}

export function user_can_create_multiuse_invite(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_create_multiuse_invite_group,
        "create_multiuse_invite_group",
        "realm",
    );
}

export function user_can_subscribe_other_users(): boolean {
    return user_has_permission(realm.realm_invite_to_stream_policy);
}

export function user_can_create_private_streams(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_create_private_channel_group,
        "can_create_private_channel_group",
        "realm",
    );
}

export function user_can_create_public_streams(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_create_public_channel_group,
        "can_create_public_channel_group",
        "realm",
    );
}

export function user_can_create_web_public_streams(): boolean {
    if (!realm.server_web_public_streams_enabled || !realm.realm_enable_spectator_access) {
        return false;
    }

    return user_has_permission_for_group_setting(
        realm.realm_can_create_web_public_channel_group,
        "can_create_web_public_channel_group",
        "realm",
    );
}

export function user_can_move_messages_between_streams(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_move_messages_between_channels_group,
        "can_move_messages_between_channels_group",
        "realm",
    );
}

export function user_can_manage_all_groups(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_manage_all_groups,
        "can_manage_all_groups",
        "realm",
    );
}

export function can_manage_user_group(group_id: number): boolean {
    if (page_params.is_spectator) {
        return false;
    }

    const group = user_groups.get_user_group_from_id(group_id);

    if (user_can_manage_all_groups()) {
        return true;
    }

    return user_has_permission_for_group_setting(
        group.can_manage_group,
        "can_manage_group",
        "group",
    );
}

export function can_add_members_to_user_group(group_id: number): boolean {
    const group = user_groups.get_user_group_from_id(group_id);

    if (
        user_has_permission_for_group_setting(
            group.can_add_members_group,
            "can_add_members_group",
            "group",
        )
    ) {
        return true;
    }

    return can_manage_user_group(group_id);
}

export function can_join_user_group(group_id: number): boolean {
    const group = user_groups.get_user_group_from_id(group_id);

    if (user_has_permission_for_group_setting(group.can_join_group, "can_join_group", "group")) {
        return true;
    }

    return can_manage_user_group(group_id);
}

export function can_leave_user_group(group_id: number): boolean {
    const group = user_groups.get_user_group_from_id(group_id);

    if (user_has_permission_for_group_setting(group.can_leave_group, "can_leave_group", "group")) {
        return true;
    }

    return can_manage_user_group(group_id);
}

export function user_can_create_user_groups(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_create_groups,
        "can_create_groups",
        "realm",
    );
}

export function user_can_add_custom_emoji(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_add_custom_emoji_group,
        "can_add_custom_emoji_group",
        "realm",
    );
}

export function user_can_move_messages_to_another_topic(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_move_messages_between_topics_group,
        "can_move_messages_between_topics_group",
        "realm",
    );
}

export function user_can_delete_any_message(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_delete_any_message_group,
        "can_delete_any_message_group",
        "realm",
    );
}

export function user_can_delete_own_message(): boolean {
    return user_has_permission_for_group_setting(
        realm.realm_can_delete_own_message_group,
        "can_delete_own_message_group",
        "realm",
    );
}

export function should_mask_unread_count(sub_muted: boolean): boolean {
    if (
        user_settings.web_stream_unreads_count_display_policy ===
        settings_config.web_stream_unreads_count_display_policy_values.no_streams.code
    ) {
        return true;
    }

    if (
        user_settings.web_stream_unreads_count_display_policy ===
        settings_config.web_stream_unreads_count_display_policy_values.unmuted_streams.code
    ) {
        return sub_muted;
    }

    return false;
}

export function using_dark_theme(): boolean {
    if (user_settings.color_scheme === settings_config.color_scheme_values.dark.code) {
        return true;
    }

    if (
        user_settings.color_scheme === settings_config.color_scheme_values.automatic.code &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
        return true;
    }
    return false;
}

export function user_email_not_configured(): boolean {
    // The following should also be true in the only circumstance
    // under which we expect this condition to be possible:
    // realm.demo_organization_scheduled_deletion_date
    return current_user.is_owner && current_user.delivery_email === "";
}

export function bot_type_id_to_string(type_id: number): string | undefined {
    const bot_type = page_params.bot_types.find((bot_type) => bot_type.type_id === type_id);

    if (bot_type === undefined) {
        return undefined;
    }

    return bot_type.name;
}

export function user_can_access_all_other_users(): boolean {
    // While spectators have is_guest=true for convenience in some code
    // paths, they do not currently use the guest user systems for
    // limiting their user access to subscribers of web-public
    // channels, which is typically the entire user set for a server
    // anyway.
    if (page_params.is_spectator) {
        return true;
    }

    return user_has_permission_for_group_setting(
        realm.realm_can_access_all_users_group,
        "can_access_all_users_group",
        "realm",
    );
}

/* istanbul ignore next */
export function get_request_data_for_stream_privacy(selected_val: string): {
    is_private: boolean;
    history_public_to_subscribers: boolean;
    is_web_public: boolean;
} {
    switch (selected_val) {
        case settings_config.stream_privacy_policy_values.public.code: {
            return {
                is_private: false,
                history_public_to_subscribers: true,
                is_web_public: false,
            };
        }
        case settings_config.stream_privacy_policy_values.private.code: {
            return {
                is_private: true,
                history_public_to_subscribers: false,
                is_web_public: false,
            };
        }
        case settings_config.stream_privacy_policy_values.web_public.code: {
            return {
                is_private: false,
                history_public_to_subscribers: true,
                is_web_public: true,
            };
        }
        default: {
            return {
                is_private: true,
                history_public_to_subscribers: true,
                is_web_public: false,
            };
        }
    }
}

export function guests_can_access_all_other_users(): boolean {
    const everyone_group = user_groups.get_user_group_from_id(
        realm.realm_can_access_all_users_group,
    );
    return everyone_group.name === "role:everyone";
}
