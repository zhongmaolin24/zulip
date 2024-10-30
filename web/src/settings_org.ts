import $ from "jquery";
import assert from "minimalistic-assert";
import {z} from "zod";

import render_settings_deactivate_realm_modal from "../templates/confirm_dialog/confirm_deactivate_realm.hbs";
import render_settings_admin_auth_methods_list from "../templates/settings/admin_auth_methods_list.hbs";

import * as audible_notifications from "./audible_notifications";
import * as blueslip from "./blueslip";
import * as channel from "./channel";
import {csrf_token} from "./csrf";
import * as dialog_widget from "./dialog_widget";
import * as dropdown_widget from "./dropdown_widget";
import {$t, $t_html, get_language_name} from "./i18n";
import * as keydown_util from "./keydown_util";
import * as loading from "./loading";
import * as pygments_data from "./pygments_data";
import * as realm_icon from "./realm_icon";
import * as realm_logo from "./realm_logo";
import {realm_user_settings_defaults} from "./realm_user_settings_defaults";
import {
    type MessageMoveTimeLimitSetting,
    type SettingOptionValueWithKey,
    realm_setting_property_schema,
    realm_user_settings_default_properties_schema,
    simple_dropdown_realm_settings_schema,
    stream_settings_property_schema,
} from "./settings_components";
import * as settings_components from "./settings_components";
import * as settings_config from "./settings_config";
import * as settings_data from "./settings_data";
import * as settings_notifications from "./settings_notifications";
import * as settings_preferences from "./settings_preferences";
import * as settings_realm_domains from "./settings_realm_domains";
import * as settings_ui from "./settings_ui";
import {current_user, group_setting_value_schema, realm, realm_schema} from "./state_data";
import type {Realm} from "./state_data";
import * as stream_settings_data from "./stream_settings_data";
import type {StreamSubscription} from "./sub_store";
import type {HTMLSelectOneElement} from "./types";
import * as ui_report from "./ui_report";
import * as user_groups from "./user_groups";
import type {UserGroup, UserGroupForDropdownListWidget} from "./user_groups";
import * as util from "./util";

const meta = {
    loaded: false,
};

export function reset(): void {
    meta.loaded = false;
}

const DISABLED_STATE_ID = -1;

export function maybe_disable_widgets(): void {
    if (current_user.is_owner) {
        return;
    }

    $(".organization-box [data-name='auth-methods']")
        .find("input, button, select, checked")
        .prop("disabled", true);

    if (current_user.is_admin) {
        $(".deactivate_realm_button").prop("disabled", true);
        $("#deactivate_realm_button_container").addClass("disabled_setting_tooltip");
        $("#org-message-retention").find("input, select").prop("disabled", true);
        $("#org-join-settings").find("input, select, button").prop("disabled", true);
        $("#id_realm_invite_required_label").parent().addClass("control-label-disabled");
        return;
    }

    $(".organization-box [data-name='organization-profile']")
        .find("input, textarea, button, select")
        .prop("disabled", true);

    $(".organization-box [data-name='organization-profile']").find(".image_upload_button").hide();

    $(".organization-box [data-name='organization-profile']")
        .find("input[type='checkbox']:disabled")
        .closest(".input-group")
        .addClass("control-label-disabled");

    $(".organization-box [data-name='organization-settings']")
        .find("input, textarea, button, select")
        .prop("disabled", true);

    $(".organization-box [data-name='organization-settings']")
        .find(".dropdown_list_reset_button")
        .hide();

    $(".organization-box [data-name='organization-settings']")
        .find("input[type='checkbox']:disabled")
        .closest(".input-group")
        .addClass("control-label-disabled");

    $(".organization-box [data-name='organization-permissions']")
        .find("input, textarea, button, select")
        .prop("disabled", true);

    $(".organization-box [data-name='organization-permissions']")
        .find("input[type='checkbox']:disabled")
        .closest(".input-group")
        .addClass("control-label-disabled");
}

export function enable_or_disable_group_permission_settings(): void {
    if (current_user.is_owner) {
        const $permission_pill_container_elements = $("#organization-permissions").find(
            ".pill-container",
        );
        $permission_pill_container_elements.find(".input").prop("contenteditable", true);
        $permission_pill_container_elements
            .closest(".input-group")
            .removeClass("group_setting_disabled");
        settings_components.enable_opening_typeahead_on_clicking_label(
            $("#organization-permissions"),
        );
        return;
    }

    if (current_user.is_admin) {
        const $permission_pill_container_elements = $("#organization-permissions").find(
            ".pill-container",
        );
        $permission_pill_container_elements.find(".input").prop("contenteditable", true);
        $permission_pill_container_elements
            .closest(".input-group")
            .removeClass("group_setting_disabled");
        settings_components.enable_opening_typeahead_on_clicking_label(
            $("#organization-permissions"),
        );

        // Admins are not allowed to update organization joining and group
        // related settings.
        const owner_editable_settings = [
            "realm_create_multiuse_invite_group",
            "realm_can_create_groups",
            "realm_can_manage_all_groups",
        ];
        for (const setting_name of owner_editable_settings) {
            const $permission_pill_container = $(`#id_${CSS.escape(setting_name)}`);
            $permission_pill_container.find(".input").prop("contenteditable", false);
            $permission_pill_container.closest(".input-group").addClass("group_setting_disabled");
            settings_components.disable_opening_typeahead_on_clicking_label(
                $permission_pill_container.closest(".input-group"),
            );
        }
        return;
    }

    const $permission_pill_container_elements = $("#organization-permissions").find(
        ".pill-container",
    );
    $permission_pill_container_elements.find(".input").prop("contenteditable", false);
    $permission_pill_container_elements.closest(".input-group").addClass("group_setting_disabled");
    settings_components.disable_opening_typeahead_on_clicking_label($("#organization-permissions"));
}

type OrganizationSettingsOptions = {
    common_policy_values: SettingOptionValueWithKey[];
    wildcard_mention_policy_values: SettingOptionValueWithKey[];
    invite_to_realm_policy_values: SettingOptionValueWithKey[];
};

export function get_organization_settings_options(): OrganizationSettingsOptions {
    return {
        common_policy_values: settings_components.get_sorted_options_list(
            settings_config.common_policy_values,
        ),
        wildcard_mention_policy_values: settings_components.get_sorted_options_list(
            settings_config.wildcard_mention_policy_values,
        ),
        invite_to_realm_policy_values: settings_components.get_sorted_options_list(
            settings_config.email_invite_to_realm_policy_values,
        ),
    };
}

type DefinedOrgTypeValues = typeof settings_config.defined_org_type_values;
type AllOrgTypeValues = typeof settings_config.all_org_type_values;

export function get_org_type_dropdown_options(): DefinedOrgTypeValues | AllOrgTypeValues {
    const current_org_type = realm.realm_org_type;
    if (current_org_type !== 0) {
        return settings_config.defined_org_type_values;
    }
    return settings_config.all_org_type_values;
}

const simple_dropdown_properties = simple_dropdown_realm_settings_schema.keyof().options;

function set_realm_waiting_period_setting(): void {
    const setting_value = realm.realm_waiting_period_threshold;
    const valid_limit_values = settings_config.waiting_period_threshold_dropdown_values.map(
        (x) => x.code,
    );

    if (valid_limit_values.includes(setting_value)) {
        $("#id_realm_waiting_period_threshold").val(setting_value);
    } else {
        $("#id_realm_waiting_period_threshold").val("custom_period");
    }

    $("#id_realm_waiting_period_threshold_custom_input").val(setting_value);
    settings_components.change_element_block_display_property(
        "id_realm_waiting_period_threshold_custom_input",
        $("#id_realm_waiting_period_threshold").val() === "custom_period",
    );
}

function update_jitsi_server_url_custom_input(dropdown_val: string): void {
    const custom_input = "id_realm_jitsi_server_url_custom_input";
    settings_components.change_element_block_display_property(
        custom_input,
        dropdown_val === "custom",
    );

    if (dropdown_val !== "custom") {
        return;
    }

    const $custom_input_elem = $(`#${CSS.escape(custom_input)}`);
    $custom_input_elem.val(realm.realm_jitsi_server_url ?? "");
}

function set_jitsi_server_url_dropdown(): void {
    if (!settings_components.is_video_chat_provider_jitsi_meet()) {
        $("#realm_jitsi_server_url_setting").hide();
        return;
    }

    $("#realm_jitsi_server_url_setting").show();

    let dropdown_val = "server_default";
    if (realm.realm_jitsi_server_url) {
        dropdown_val = "custom";
    }

    $("#id_realm_jitsi_server_url").val(dropdown_val);
    update_jitsi_server_url_custom_input(dropdown_val);
}

function set_video_chat_provider_dropdown(): void {
    const chat_provider_id = realm.realm_video_chat_provider;
    $("#id_realm_video_chat_provider").val(chat_provider_id);

    set_jitsi_server_url_dropdown();
}

function set_giphy_rating_dropdown(): void {
    const rating_id = realm.realm_giphy_rating;
    $("#id_realm_giphy_rating").val(rating_id);
}

function update_message_edit_sub_settings(is_checked: boolean): void {
    settings_ui.disable_sub_setting_onchange(
        is_checked,
        "id_realm_message_content_edit_limit_seconds",
        true,
    );
    settings_ui.disable_sub_setting_onchange(
        is_checked,
        "id_realm_message_content_edit_limit_minutes",
        true,
    );
}

function set_msg_edit_limit_dropdown(): void {
    settings_components.set_time_limit_setting("realm_message_content_edit_limit_seconds");
}

function message_move_limit_setting_enabled(
    related_setting_name:
        | "realm_can_move_messages_between_topics_group"
        | "realm_can_move_messages_between_channels_group",
): boolean {
    const user_group_id = settings_components.get_dropdown_list_widget_setting_value(
        $(`#id_${related_setting_name}`),
    );
    assert(typeof user_group_id === "number");
    const user_group_name = user_groups.get_user_group_from_id(user_group_id).name;
    if (
        user_group_name === "role:administrators" ||
        user_group_name === "role:moderators" ||
        user_group_name === "role:nobody"
    ) {
        return false;
    }

    return true;
}

function enable_or_disable_related_message_move_time_limit_setting(
    setting_name: MessageMoveTimeLimitSetting,
    disable_setting: boolean,
): void {
    const $setting_elem = $(`#id_${CSS.escape(setting_name)}`);
    const $custom_input_elem = $setting_elem.parent().find(".time-limit-custom-input");

    settings_ui.disable_sub_setting_onchange(disable_setting, $setting_elem.attr("id")!, true);
    settings_ui.disable_sub_setting_onchange(disable_setting, $custom_input_elem.attr("id")!, true);
}

function set_msg_move_limit_setting(property_name: MessageMoveTimeLimitSetting): void {
    settings_components.set_time_limit_setting(property_name);

    let disable_setting;
    if (property_name === "realm_move_messages_within_stream_limit_seconds") {
        disable_setting = message_move_limit_setting_enabled(
            "realm_can_move_messages_between_topics_group",
        );
    } else {
        disable_setting = message_move_limit_setting_enabled(
            "realm_can_move_messages_between_channels_group",
        );
    }
    enable_or_disable_related_message_move_time_limit_setting(property_name, disable_setting);
}

function message_delete_limit_setting_enabled(): boolean {
    // This function is used to check whether the time-limit setting
    // should be enabled. The setting is disabled when every user
    // who is allowed to delete their own messages is also allowed
    // to delete any message in the organization.
    const realm_can_delete_own_message_group_id =
        settings_components.get_dropdown_list_widget_setting_value(
            $("#id_realm_can_delete_own_message_group"),
        );
    const realm_can_delete_any_message_group_id =
        settings_components.get_dropdown_list_widget_setting_value(
            $("#id_realm_can_delete_any_message_group"),
        );
    assert(typeof realm_can_delete_any_message_group_id === "number");
    const can_delete_any_message_subgroups = user_groups.get_recursive_subgroups(
        user_groups.get_user_group_from_id(realm_can_delete_any_message_group_id),
    );
    assert(can_delete_any_message_subgroups !== undefined);
    can_delete_any_message_subgroups.add(realm_can_delete_any_message_group_id);
    assert(typeof realm_can_delete_own_message_group_id === "number");
    return !can_delete_any_message_subgroups.has(realm_can_delete_own_message_group_id);
}

function check_disable_message_delete_limit_setting_dropdown(): void {
    settings_ui.disable_sub_setting_onchange(
        message_delete_limit_setting_enabled(),
        "id_realm_message_content_delete_limit_seconds",
        true,
    );
    if ($("#id_realm_message_content_delete_limit_minutes").length) {
        settings_ui.disable_sub_setting_onchange(
            message_delete_limit_setting_enabled(),
            "id_realm_message_content_delete_limit_minutes",
            true,
        );
    }
}

function set_msg_delete_limit_dropdown(): void {
    settings_components.set_time_limit_setting("realm_message_content_delete_limit_seconds");
}

function get_dropdown_value_for_message_retention_setting(setting_value: number | null): string {
    if (setting_value === settings_config.retain_message_forever) {
        return "unlimited";
    }

    if (setting_value === null) {
        return "realm_default";
    }

    return "custom_period";
}

export function set_message_retention_setting_dropdown(sub: StreamSubscription | undefined): void {
    let property_name: "message_retention_days" | "realm_message_retention_days";
    let setting_value: number | null;
    if (sub !== undefined) {
        property_name = "message_retention_days";
        setting_value = sub.message_retention_days;
    } else {
        property_name = "realm_message_retention_days";
        setting_value = realm.realm_message_retention_days;
    }
    const dropdown_val = get_dropdown_value_for_message_retention_setting(setting_value);

    const $dropdown_elem = $(`#id_${CSS.escape(property_name)}`);
    $dropdown_elem.val(dropdown_val);

    const $custom_input_elem = $dropdown_elem
        .parent()
        .find(".message-retention-setting-custom-input")
        .val("");
    if (dropdown_val === "custom_period") {
        assert(setting_value !== null);
        $custom_input_elem.val(setting_value);
    }

    settings_components.change_element_block_display_property(
        $custom_input_elem.attr("id")!,
        dropdown_val === "custom_period",
    );
}

function set_org_join_restrictions_dropdown(): void {
    const value = settings_components.get_realm_settings_property_value(
        "realm_org_join_restrictions",
    );
    assert(typeof value === "string");
    $("#id_realm_org_join_restrictions").val(value);
    settings_components.change_element_block_display_property(
        "allowed_domains_label",
        value === "only_selected_domain",
    );
}

function set_message_content_in_email_notifications_visibility(): void {
    settings_components.change_element_block_display_property(
        "message_content_in_email_notifications_label",
        realm.realm_message_content_allowed_in_email_notifications,
    );
}

function set_digest_emails_weekday_visibility(): void {
    settings_components.change_element_block_display_property(
        "id_realm_digest_weekday",
        realm.realm_digest_emails_enabled,
    );
}

function set_create_web_public_stream_dropdown_visibility(): void {
    settings_components.change_element_block_display_property(
        "id_realm_can_create_web_public_channel_group",
        realm.server_web_public_streams_enabled &&
            realm.zulip_plan_is_not_limited &&
            realm.realm_enable_spectator_access,
    );
}

export function check_disable_direct_message_initiator_group_dropdown(current_value: number): void {
    if (user_groups.is_empty_group(current_value)) {
        $("#realm_direct_message_initiator_group_widget").prop("disabled", true);
    } else {
        $("#realm_direct_message_initiator_group_widget").prop("disabled", false);
    }
}

export function populate_realm_domains_label(
    realm_domains: {domain: string; allow_subdomains: boolean}[],
): void {
    if (!meta.loaded) {
        return;
    }

    const domains_list = realm_domains.map((realm_domain) =>
        realm_domain.allow_subdomains ? "*." + realm_domain.domain : realm_domain.domain,
    );
    let domains = util.format_array_as_list(domains_list, "long", "conjunction");
    if (domains.length === 0) {
        domains = $t({defaultMessage: "None"});
    }
    $("#allowed_domains_label").text($t({defaultMessage: "Allowed domains: {domains}"}, {domains}));
}

function can_configure_auth_methods(): boolean {
    if (settings_data.user_email_not_configured()) {
        return false;
    }
    if (current_user.is_owner) {
        return true;
    }
    return false;
}

export function populate_auth_methods(auth_method_to_bool_map: Record<string, boolean>): void {
    if (!meta.loaded) {
        return;
    }
    const $auth_methods_list = $("#id_realm_authentication_methods").expectOne();
    let rendered_auth_method_rows = "";
    for (const [auth_method, value] of Object.entries(auth_method_to_bool_map)) {
        // Certain authentication methods are not available to be enabled without
        // purchasing a plan, so we need to disable them in this UI.
        // The restriction only applies to **enabling** the auth method, so this
        // logic is dependent on the current value.
        // The reason for that is that if for any reason, the auth method is already
        // enabled (for example, because it was manually enabled for the organization
        // by request, as an exception) - the organization should be able to disable it
        // if they don't want it anymore.
        const cant_be_enabled =
            !realm.realm_authentication_methods[auth_method]!.available && !value;

        const render_args = {
            method: auth_method,
            enabled: value,
            disable_configure_auth_method: !can_configure_auth_methods() || cant_be_enabled,
            // The negated character class regexp serves as an allowlist - the replace() will
            // remove *all* symbols *but* digits (\d) and lowecase letters (a-z),
            // so that we can make assumptions on this string elsewhere in the code.
            // As a result, the only two "incoming" assumptions on the auth method name are:
            // 1) It contains at least one allowed symbol
            // 2) No two auth method names are identical after this allowlist filtering
            prefix: "id_authmethod" + auth_method.toLowerCase().replaceAll(/[^\da-z]/g, "") + "_",
            ...(cant_be_enabled && {
                unavailable_reason:
                    realm.realm_authentication_methods[auth_method]!.unavailable_reason,
            }),
        };

        rendered_auth_method_rows += render_settings_admin_auth_methods_list(render_args);
    }
    $auth_methods_list.html(rendered_auth_method_rows);
}

function update_dependent_subsettings(property_name: string): void {
    const parsed_property_name = simple_dropdown_realm_settings_schema
        .keyof()
        .safeParse(property_name);
    if (parsed_property_name.success) {
        settings_components.set_property_dropdown_value(parsed_property_name.data);
        return;
    }

    switch (property_name) {
        case "realm_allow_message_editing":
            update_message_edit_sub_settings(realm.realm_allow_message_editing);
            break;
        case "realm_can_delete_any_message_group":
            check_disable_message_delete_limit_setting_dropdown();
            break;
        case "realm_can_delete_own_message_group":
            check_disable_message_delete_limit_setting_dropdown();
            break;
        case "realm_can_move_messages_between_channels_group":
            set_msg_move_limit_setting("realm_move_messages_between_streams_limit_seconds");
            break;
        case "realm_can_move_messages_between_topics_group":
            set_msg_move_limit_setting("realm_move_messages_within_stream_limit_seconds");
            break;
        case "realm_org_join_restrictions":
            set_org_join_restrictions_dropdown();
            break;
        case "realm_message_content_allowed_in_email_notifications":
            set_message_content_in_email_notifications_visibility();
            break;
        case "realm_digest_emails_enabled":
            settings_notifications.set_enable_digest_emails_visibility(
                $("#user-notification-settings"),
                false,
            );
            settings_notifications.set_enable_digest_emails_visibility(
                $("#realm-user-default-settings"),
                true,
            );
            set_digest_emails_weekday_visibility();
            break;
        case "realm_enable_spectator_access":
            set_create_web_public_stream_dropdown_visibility();
            break;
        case "realm_direct_message_permission_group":
            check_disable_direct_message_initiator_group_dropdown(
                realm.realm_direct_message_permission_group,
            );
            break;
    }
}

export function discard_realm_property_element_changes(elem: HTMLElement): void {
    const $elem = $(elem);
    const property_name = settings_components.extract_property_name($elem);
    const property_value = settings_components.get_realm_settings_property_value(
        realm_setting_property_schema.parse(property_name),
    );

    switch (property_name) {
        case "realm_authentication_methods":
            populate_auth_methods(
                settings_components.realm_authentication_methods_to_boolean_dict(),
            );
            break;
        case "realm_new_stream_announcements_stream_id":
        case "realm_signup_announcements_stream_id":
        case "realm_zulip_update_announcements_stream_id":
        case "realm_default_code_block_language":
        case "realm_direct_message_initiator_group":
        case "realm_direct_message_permission_group":
        case "realm_can_add_custom_emoji_group":
        case "realm_can_access_all_users_group":
        case "realm_can_create_web_public_channel_group":
        case "realm_can_delete_any_message_group":
        case "realm_can_delete_own_message_group":
        case "realm_can_move_messages_between_channels_group":
        case "realm_can_move_messages_between_topics_group":
            assert(typeof property_value === "string" || typeof property_value === "number");
            settings_components.set_dropdown_list_widget_setting_value(
                property_name,
                property_value,
            );
            break;
        case "realm_can_create_groups":
        case "realm_can_create_public_channel_group":
        case "realm_can_create_private_channel_group":
        case "realm_can_manage_all_groups":
        case "realm_create_multiuse_invite_group": {
            const pill_widget = settings_components.get_group_setting_widget(property_name);
            assert(pill_widget !== null);
            settings_components.set_group_setting_widget_value(
                pill_widget,
                group_setting_value_schema.parse(property_value),
            );
            break;
        }
        case "realm_default_language":
            assert(typeof property_value === "string");
            $("#org-notifications .language_selection_widget .language_selection_button span").attr(
                "data-language-code",
                property_value,
            );
            $("#org-notifications .language_selection_widget .language_selection_button span").text(
                // We know this is defined, since we got the `property_value` from a dropdown
                // of valid language options.
                get_language_name(property_value)!,
            );
            break;
        case "realm_org_type":
            assert(typeof property_value === "number");
            settings_components.set_input_element_value($elem, property_value);
            // Remove 'unspecified' option (value=0) from realm_org_type
            // dropdown menu options whenever realm.realm_org_type
            // returns another value.
            if (property_value !== 0) {
                $("#id_realm_org_type option[value=0]").remove();
            }
            break;
        case "realm_message_content_edit_limit_seconds":
        case "realm_message_content_delete_limit_seconds":
            settings_components.set_time_limit_setting(property_name);
            break;
        case "realm_move_messages_within_stream_limit_seconds":
        case "realm_move_messages_between_streams_limit_seconds":
            set_msg_move_limit_setting(property_name);
            break;
        case "realm_video_chat_provider":
            set_video_chat_provider_dropdown();
            break;
        case "realm_jitsi_server_url":
            set_jitsi_server_url_dropdown();
            break;
        case "realm_message_retention_days":
            set_message_retention_setting_dropdown(undefined);
            break;
        case "realm_waiting_period_threshold":
            set_realm_waiting_period_setting();
            break;
        default:
            if (property_value !== undefined) {
                const validated_property_value = z
                    .union([z.string(), z.number(), z.boolean()])
                    .parse(property_value);
                settings_components.set_input_element_value($elem, validated_property_value);
            } else {
                blueslip.error("Element refers to unknown property", {property_name});
            }
    }
    update_dependent_subsettings(property_name);
}

export function discard_stream_property_element_changes(
    elem: HTMLElement,
    sub: StreamSubscription,
): void {
    const $elem = $(elem);
    const property_name = settings_components.extract_property_name($elem);
    const property_value = settings_components.get_stream_settings_property_value(
        stream_settings_property_schema.parse(property_name),
        sub,
    );
    switch (property_name) {
        case "can_remove_subscribers_group":
            assert(typeof property_value === "number");
            settings_components.set_dropdown_list_widget_setting_value(
                property_name,
                property_value,
            );
            break;
        case "stream_privacy": {
            assert(typeof property_value === "string");
            $elem.find(`input[value='${CSS.escape(property_value)}']`).prop("checked", true);

            // Hide stream privacy warning banner
            const $stream_permissions_warning_banner = $(
                "#stream_permission_settings .stream-permissions-warning-banner",
            );
            if (!$stream_permissions_warning_banner.is(":empty")) {
                $stream_permissions_warning_banner.empty();
            }
            break;
        }
        case "message_retention_days":
            set_message_retention_setting_dropdown(sub);
            break;
        default:
            if (property_value !== undefined) {
                const validated_property_value = z
                    .union([z.string(), z.number(), z.boolean()])
                    .parse(property_value);
                settings_components.set_input_element_value($elem, validated_property_value);
            } else {
                blueslip.error("Element refers to unknown property", {property_name});
            }
    }
    update_dependent_subsettings(property_name);
}

export function discard_group_property_element_changes(elem: HTMLElement, group: UserGroup): void {
    const $elem = $(elem);
    const property_name = settings_components.extract_property_name($elem);
    const property_value = settings_components.get_group_property_value(
        user_groups.user_group_schema.keyof().parse(property_name),
        group,
    );

    const group_widget_settings = [...settings_components.group_setting_widget_map.keys()];
    if (group_widget_settings.includes(property_name)) {
        const pill_widget = settings_components.get_group_setting_widget(property_name);
        assert(pill_widget !== null);
        settings_components.set_group_setting_widget_value(
            pill_widget,
            group_setting_value_schema.parse(property_value),
        );
    } else {
        blueslip.error("Element refers to unknown property", {property_name});
    }
    update_dependent_subsettings(property_name);
}

export function discard_realm_default_property_element_changes(elem: HTMLElement): void {
    const $elem = $(elem);
    const property_name = realm_user_settings_default_properties_schema.parse(
        settings_components.extract_property_name($elem, true),
    );
    const property_value =
        settings_components.get_realm_default_setting_property_value(property_name);
    switch (property_name) {
        case "notification_sound":
            assert(typeof property_value === "string");
            audible_notifications.update_notification_sound_source(
                $("audio#realm-default-notification-sound-audio"),
                {
                    notification_sound: property_value,
                },
            );
            settings_components.set_input_element_value($elem, property_value);
            break;
        case "emojiset":
        case "user_list_style":
            // Because this widget has a radio button structure, it
            // needs custom reset code.
            $elem
                .find(`input[value='${CSS.escape(property_value.toString())}']`)
                .prop("checked", true);
            break;
        case "email_notifications_batching_period_seconds":
        case "email_notification_batching_period_edit_minutes":
            settings_notifications.set_notification_batching_ui(
                $("#realm-user-default-settings"),
                realm_user_settings_defaults.email_notifications_batching_period_seconds,
            );
            break;
        default:
            if (property_value !== undefined) {
                const validated_property_value = z
                    .union([z.string(), z.number(), z.boolean()])
                    .parse(property_value);
                settings_components.set_input_element_value($elem, validated_property_value);
            } else {
                blueslip.error("Element refers to unknown property", {property_name});
            }
    }
    update_dependent_subsettings(property_name);
}

function discard_realm_settings_subsection_changes($subsection: JQuery): void {
    for (const elem of settings_components.get_subsection_property_elements($subsection)) {
        discard_realm_property_element_changes(elem);
    }
    const $save_btn_controls = $subsection.find(".save-button-controls");
    settings_components.change_save_button_state($save_btn_controls, "discarded");
}

export function discard_stream_settings_subsection_changes(
    $subsection: JQuery,
    sub: StreamSubscription,
): void {
    for (const elem of settings_components.get_subsection_property_elements($subsection)) {
        discard_stream_property_element_changes(elem, sub);
    }
    const $save_btn_controls = $subsection.find(".save-button-controls");
    settings_components.change_save_button_state($save_btn_controls, "discarded");
}

export function discard_group_settings_subsection_changes(
    $subsection: JQuery,
    group: UserGroup,
): void {
    for (const elem of settings_components.get_subsection_property_elements($subsection)) {
        discard_group_property_element_changes(elem, group);
    }
    const $save_btn_controls = $subsection.find(".save-button-controls");
    settings_components.change_save_button_state($save_btn_controls, "discarded");
}

export function discard_realm_default_settings_subsection_changes($subsection: JQuery): void {
    for (const elem of settings_components.get_subsection_property_elements($subsection)) {
        discard_realm_default_property_element_changes(elem);
    }
    const $save_btn_controls = $subsection.find(".save-button-controls");
    settings_components.change_save_button_state($save_btn_controls, "discarded");
}

export function deactivate_organization(e: JQuery.Event): void {
    e.preventDefault();
    e.stopPropagation();

    function do_deactivate_realm(): void {
        channel.post({
            url: "/json/realm/deactivate",
            error(xhr) {
                ui_report.error($t_html({defaultMessage: "Failed"}), xhr, $("#dialog_error"));
            },
        });
    }

    const html_body = render_settings_deactivate_realm_modal();

    dialog_widget.launch({
        html_heading: $t_html({defaultMessage: "Deactivate organization"}),
        help_link: "/help/deactivate-your-organization",
        html_body,
        on_click: do_deactivate_realm,
        close_on_submit: false,
        focus_submit_on_open: true,
        html_submit_button: $t_html({defaultMessage: "Confirm"}),
    });
}

export function sync_realm_settings(property: string): void {
    if (!meta.loaded) {
        return;
    }

    switch (property) {
        case "emails_restricted_to_domains":
        case "disallow_disposable_email_addresses":
            property = "org_join_restrictions";
            break;
    }
    const $element = $(`#id_realm_${CSS.escape(property)}`);
    if ($element.length) {
        const $subsection = $element.closest(".settings-subsection-parent");
        if ($subsection.find(".save-button-controls").hasClass("hide")) {
            discard_realm_property_element_changes(util.the($element));
        } else {
            discard_realm_settings_subsection_changes($subsection);
        }
    }
}

export function save_organization_settings(
    data: Record<string, string | number | boolean>,
    $save_button: JQuery,
    patch_url: string,
    success_continuation: (() => void) | undefined,
): void {
    const $subsection_parent = $save_button.closest(".settings-subsection-parent");
    const $save_btn_container = $subsection_parent.find(".save-button-controls");
    const $failed_alert_elem = $subsection_parent.find(".subsection-failed-status p");
    settings_components.change_save_button_state($save_btn_container, "saving");
    channel.patch({
        url: patch_url,
        data,
        success() {
            $failed_alert_elem.hide();
            settings_components.change_save_button_state($save_btn_container, "succeeded");
            if (success_continuation !== undefined) {
                success_continuation();
            }
        },
        error(xhr) {
            settings_components.change_save_button_state($save_btn_container, "failed");
            $save_button.hide();
            ui_report.error($t_html({defaultMessage: "Save failed"}), xhr, $failed_alert_elem);
        },
    });
}

export function set_up(): void {
    build_page();
    maybe_disable_widgets();
}

function set_up_dropdown_widget(
    setting_name: keyof Realm,
    setting_options: () => dropdown_widget.Option[],
    setting_type: string,
    custom_dropdown_widget_callback?: (current_value: string | number | undefined) => void,
): void {
    const $save_discard_widget_container = $(`#id_${CSS.escape(setting_name)}`).closest(
        ".settings-subsection-parent",
    );
    const $events_container = $(`#id_${CSS.escape(setting_name)}`).closest(".settings-section");

    let text_if_current_value_not_in_options;
    if (setting_type === "channel") {
        text_if_current_value_not_in_options = $t({defaultMessage: "Cannot view channel"});
    }

    let unique_id_type = dropdown_widget.DataTypes.NUMBER;
    if (setting_type === "language") {
        unique_id_type = dropdown_widget.DataTypes.STRING;
    }

    const setting_dropdown_widget = new dropdown_widget.DropdownWidget({
        widget_name: setting_name,
        get_options: setting_options,
        $events_container,
        item_click_callback(event, dropdown, this_widget) {
            dropdown.hide();
            event.preventDefault();
            event.stopPropagation();
            this_widget.render();
            settings_components.save_discard_realm_settings_widget_status_handler(
                $save_discard_widget_container,
            );
            if (custom_dropdown_widget_callback !== undefined) {
                custom_dropdown_widget_callback(this_widget.current_value);
            }
        },
        default_id: z.union([z.string(), z.number()]).parse(realm[setting_name]),
        unique_id_type,
        ...(text_if_current_value_not_in_options && {text_if_current_value_not_in_options}),
        on_mount_callback(dropdown) {
            if (setting_type === "group") {
                $(dropdown.popper).css("min-width", "300px");
                $(dropdown.popper).find(".simplebar-content").css("width", "max-content");
                $(dropdown.popper).find(".simplebar-content").css("min-width", "100%");
            }
        },
    });
    settings_components.set_dropdown_setting_widget(setting_name, setting_dropdown_widget);
    setting_dropdown_widget.setup();
}

export function set_up_dropdown_widget_for_realm_group_settings(): void {
    const realm_group_permission_settings = Object.keys(
        realm.server_supported_permission_settings.realm,
    );

    const settings_using_pills_ui = new Set([
        "can_create_groups",
        "can_create_public_channel_group",
        "can_create_private_channel_group",
        "can_manage_all_groups",
        "create_multiuse_invite_group",
    ]);
    for (const setting_name of realm_group_permission_settings) {
        if (settings_using_pills_ui.has(setting_name)) {
            continue;
        }
        const get_setting_options = (): UserGroupForDropdownListWidget[] =>
            user_groups.get_realm_user_groups_for_dropdown_list_widget(setting_name, "realm");
        let dropdown_list_item_click_callback:
            | ((current_value: string | number | undefined) => void)
            | undefined;
        switch (setting_name) {
            case "direct_message_permission_group": {
                dropdown_list_item_click_callback = (
                    current_value: string | number | undefined,
                ): void => {
                    assert(typeof current_value === "number");
                    check_disable_direct_message_initiator_group_dropdown(current_value);
                };

                break;
            }
            case "can_delete_any_message_group":
            case "can_delete_own_message_group": {
                dropdown_list_item_click_callback =
                    check_disable_message_delete_limit_setting_dropdown;

                break;
            }
            case "can_move_messages_between_channels_group": {
                dropdown_list_item_click_callback = () => {
                    set_msg_move_limit_setting("realm_move_messages_between_streams_limit_seconds");
                };

                break;
            }
            case "can_move_messages_between_topics_group": {
                dropdown_list_item_click_callback = () => {
                    set_msg_move_limit_setting("realm_move_messages_within_stream_limit_seconds");
                };

                break;
            }
            // No default
        }

        set_up_dropdown_widget(
            realm_schema.keyof().parse("realm_" + setting_name),
            get_setting_options,
            "group",
            dropdown_list_item_click_callback,
        );
    }
}

export function init_dropdown_widgets(): void {
    const notification_stream_options = (): dropdown_widget.Option[] => {
        const streams = stream_settings_data.get_streams_for_settings_page();
        const options: dropdown_widget.Option[] = streams.map((stream) => ({
            name: stream.name,
            unique_id: stream.stream_id,
            stream,
        }));

        const disabled_option = {
            is_setting_disabled: true,
            unique_id: DISABLED_STATE_ID,
            name: $t({defaultMessage: "Disabled"}),
        };

        options.unshift(disabled_option);
        return options;
    };

    set_up_dropdown_widget(
        "realm_new_stream_announcements_stream_id",
        notification_stream_options,
        "channel",
    );
    set_up_dropdown_widget(
        "realm_signup_announcements_stream_id",
        notification_stream_options,
        "channel",
    );
    set_up_dropdown_widget(
        "realm_zulip_update_announcements_stream_id",
        notification_stream_options,
        "channel",
    );

    const default_code_language_options = (): dropdown_widget.Option[] => {
        const options = Object.keys(pygments_data.langs).map((x) => ({
            name: x,
            unique_id: x,
        }));

        const disabled_option = {
            is_setting_disabled: true,
            unique_id: "",
            name: $t({defaultMessage: "No language set"}),
        };

        options.unshift(disabled_option);
        return options;
    };
    set_up_dropdown_widget(
        "realm_default_code_block_language",
        default_code_language_options,
        "language",
    );

    set_up_dropdown_widget_for_realm_group_settings();
}

export function register_save_discard_widget_handlers(
    $container: JQuery,
    patch_url: string,
    for_realm_default_settings: boolean,
): void {
    $container.on("change input", "input, select, textarea", function (this: HTMLElement, e) {
        e.preventDefault();
        e.stopPropagation();

        // This event handler detects whether after these input
        // changes, any fields have different values from the current
        // official values stored in the database and page_params.  If
        // they do, we transition to the "unsaved" state showing the
        // save/discard widget; otherwise, we hide that widget (the
        // "discarded" state).

        if ($(this).hasClass("no-input-change-detection")) {
            // This is to prevent input changes detection in elements
            // within a subsection whose changes should not affect the
            // visibility of the discard button
            return false;
        }

        if ($(this).hasClass("setting_email_notifications_batching_period_seconds")) {
            const show_elem = $(this).val() === "custom_period";
            settings_components.change_element_block_display_property(
                "realm_email_notification_batching_period_edit_minutes",
                show_elem,
            );
        }

        const $subsection = $(this).closest(".settings-subsection-parent");
        if (for_realm_default_settings) {
            settings_components.save_discard_default_realm_settings_widget_status_handler(
                $subsection,
            );
        } else {
            settings_components.save_discard_realm_settings_widget_status_handler($subsection);
        }

        return undefined;
    });

    $container.on(
        "click",
        ".subsection-header .subsection-changes-discard button",
        function (this: HTMLElement, e) {
            e.preventDefault();
            e.stopPropagation();
            const $subsection = $(this).closest(".settings-subsection-parent");
            if (for_realm_default_settings) {
                discard_realm_default_settings_subsection_changes($subsection);
            } else {
                discard_realm_settings_subsection_changes($subsection);
            }
        },
    );

    $container.on(
        "click",
        ".subsection-header .subsection-changes-save button",
        function (this: HTMLElement, e: JQuery.ClickEvent) {
            e.preventDefault();
            e.stopPropagation();
            const $save_button = $(this);
            const $subsection_elem = $save_button.closest(".settings-subsection-parent");
            let data: Record<string, string | number | boolean>;
            let success_continuation;
            if (!for_realm_default_settings) {
                data =
                    settings_components.populate_data_for_realm_settings_request($subsection_elem);
            } else {
                data =
                    settings_components.populate_data_for_default_realm_settings_request(
                        $subsection_elem,
                    );

                if (
                    data.dense_mode !== undefined ||
                    data.web_font_size_px !== undefined ||
                    data.web_line_height_percent !== undefined
                ) {
                    success_continuation = () => {
                        settings_preferences.update_information_density_settings_visibility(
                            $("#realm-user-default-settings"),
                            realm_user_settings_defaults,
                            data,
                        );
                    };
                }
            }
            save_organization_settings(data, $save_button, patch_url, success_continuation);
        },
    );
}

function initialize_group_setting_widgets(): void {
    settings_components.create_realm_group_setting_widget({
        $pill_container: $("#id_realm_create_multiuse_invite_group"),
        setting_name: "create_multiuse_invite_group",
    });
    settings_components.create_realm_group_setting_widget({
        $pill_container: $("#id_realm_can_create_public_channel_group"),
        setting_name: "can_create_public_channel_group",
    });
    settings_components.create_realm_group_setting_widget({
        $pill_container: $("#id_realm_can_create_private_channel_group"),
        setting_name: "can_create_private_channel_group",
    });
    settings_components.create_realm_group_setting_widget({
        $pill_container: $("#id_realm_can_create_groups"),
        setting_name: "can_create_groups",
    });
    settings_components.create_realm_group_setting_widget({
        $pill_container: $("#id_realm_can_manage_all_groups"),
        setting_name: "can_manage_all_groups",
    });

    enable_or_disable_group_permission_settings();
}

export function build_page(): void {
    meta.loaded = true;

    loading.make_indicator($("#admin_page_auth_methods_loading_indicator"));

    // Initialize all the dropdown list widgets.
    init_dropdown_widgets();
    // Populate realm domains
    populate_realm_domains_label(realm.realm_domains);

    initialize_group_setting_widgets();

    // Populate authentication methods table

    populate_auth_methods(settings_components.realm_authentication_methods_to_boolean_dict());

    for (const property_name of simple_dropdown_properties) {
        settings_components.set_property_dropdown_value(property_name);
    }

    set_realm_waiting_period_setting();
    set_video_chat_provider_dropdown();
    set_giphy_rating_dropdown();
    set_msg_edit_limit_dropdown();
    set_msg_move_limit_setting("realm_move_messages_within_stream_limit_seconds");
    set_msg_move_limit_setting("realm_move_messages_between_streams_limit_seconds");
    set_msg_delete_limit_dropdown();
    set_message_retention_setting_dropdown(undefined);
    set_org_join_restrictions_dropdown();
    set_message_content_in_email_notifications_visibility();
    set_digest_emails_weekday_visibility();
    set_create_web_public_stream_dropdown_visibility();

    register_save_discard_widget_handlers($(".admin-realm-form"), "/json/realm", false);

    $(".settings-subsection-parent").on("keydown", "input", (e) => {
        e.stopPropagation();
        if (keydown_util.is_enter_event(e)) {
            e.preventDefault();
            $(e.target)
                .closest(".settings-subsection-parent")
                .find(".subsection-changes-save button")
                .trigger("click");
        }
    });

    $("#id_realm_message_content_edit_limit_seconds").on("change", () => {
        settings_components.update_custom_value_input("realm_message_content_edit_limit_seconds");
    });

    $("#id_realm_move_messages_between_streams_limit_seconds").on("change", () => {
        settings_components.update_custom_value_input(
            "realm_move_messages_between_streams_limit_seconds",
        );
    });

    $("#id_realm_move_messages_within_stream_limit_seconds").on("change", () => {
        settings_components.update_custom_value_input(
            "realm_move_messages_within_stream_limit_seconds",
        );
    });

    $("#id_realm_message_content_delete_limit_seconds").on("change", () => {
        settings_components.update_custom_value_input("realm_message_content_delete_limit_seconds");
    });

    $("#id_realm_video_chat_provider").on("change", () => {
        set_jitsi_server_url_dropdown();
    });

    $<HTMLSelectOneElement>("select:not([multiple])#id_realm_jitsi_server_url").on(
        "change",
        function () {
            const dropdown_val = this.value;
            update_jitsi_server_url_custom_input(dropdown_val);
        },
    );

    $<HTMLSelectOneElement>("select:not([multiple])#id_realm_message_retention_days").on(
        "change",
        function () {
            const message_retention_setting_dropdown_value = this.value;
            settings_components.change_element_block_display_property(
                "id_realm_message_retention_custom_input",
                message_retention_setting_dropdown_value === "custom_period",
            );
        },
    );

    $<HTMLSelectOneElement>("select:not([multiple])#id_realm_waiting_period_threshold").on(
        "change",
        function () {
            const waiting_period_threshold = this.value;
            settings_components.change_element_block_display_property(
                "id_realm_waiting_period_threshold_custom_input",
                waiting_period_threshold === "custom_period",
            );
        },
    );

    $("#id_realm_digest_emails_enabled").on("change", function () {
        const digest_emails_enabled = $(this).is(":checked");
        settings_components.change_element_block_display_property(
            "id_realm_digest_weekday",
            digest_emails_enabled,
        );
    });

    $<HTMLSelectOneElement>("select:not([multiple])#id_realm_org_join_restrictions").on(
        "change",
        function () {
            const org_join_restrictions = this.value;
            const $node = $("#allowed_domains_label").parent();
            if (org_join_restrictions === "only_selected_domain") {
                $node.show();
                if (realm.realm_domains.length === 0) {
                    settings_realm_domains.show_realm_domains_modal();
                }
            } else {
                $node.hide();
            }
        },
    );

    $<HTMLInputElement>("input#id_realm_allow_message_editing").on("change", function () {
        update_message_edit_sub_settings(this.checked);
    });

    $("#id_realm_org_join_restrictions").on("click", (e) => {
        // This prevents the disappearance of modal when there are
        // no allowed domains otherwise it gets closed due to
        // the click event handler attached to `#settings_overlay_container`
        e.stopPropagation();
    });

    $("#show_realm_domains_modal").on("click", (e) => {
        e.stopPropagation();
        settings_realm_domains.show_realm_domains_modal();
    });

    function realm_icon_logo_upload_complete(
        $spinner: JQuery,
        $upload_text: JQuery,
        $delete_button: JQuery,
    ): void {
        $spinner.css({visibility: "hidden"});
        $upload_text.show();
        $delete_button.show();
    }

    function realm_icon_logo_upload_start(
        $spinner: JQuery,
        $upload_text: JQuery,
        $delete_button: JQuery,
    ): void {
        $spinner.css({visibility: "visible"});
        $upload_text.hide();
        $delete_button.hide();
    }

    function upload_realm_logo_or_icon(
        $file_input: JQuery<HTMLInputElement>,
        night: boolean | null,
        icon: boolean,
    ): void {
        const form_data = new FormData();
        let widget;
        let url;

        assert(csrf_token !== undefined);
        form_data.append("csrfmiddlewaretoken", csrf_token);
        const files = util.the($file_input).files;
        assert(files !== null);
        for (const [i, file] of [...files].entries()) {
            form_data.append("file-" + i, file);
        }
        if (icon) {
            url = "/json/realm/icon";
            widget = "#realm-icon-upload-widget";
        } else {
            if (night) {
                widget = "#realm-night-logo-upload-widget";
            } else {
                widget = "#realm-day-logo-upload-widget";
            }
            url = "/json/realm/logo";
            form_data.append("night", JSON.stringify(night));
        }
        const $spinner = $(`${widget} .upload-spinner-background`).expectOne();
        const $upload_text = $(`${widget}  .image-upload-text`).expectOne();
        const $delete_button = $(`${widget}  .image-delete-button`).expectOne();
        const $error_field = $(`${widget}  .image_file_input_error`).expectOne();
        realm_icon_logo_upload_start($spinner, $upload_text, $delete_button);
        $error_field.hide();
        channel.post({
            url,
            data: form_data,
            cache: false,
            processData: false,
            contentType: false,
            success() {
                realm_icon_logo_upload_complete($spinner, $upload_text, $delete_button);
            },
            error(xhr) {
                realm_icon_logo_upload_complete($spinner, $upload_text, $delete_button);
                ui_report.error("", xhr, $error_field);
            },
        });
    }

    check_disable_message_delete_limit_setting_dropdown();

    realm_icon.build_realm_icon_widget(upload_realm_logo_or_icon);
    if (realm.zulip_plan_is_not_limited) {
        realm_logo.build_realm_logo_widget(upload_realm_logo_or_icon, false);
        realm_logo.build_realm_logo_widget(upload_realm_logo_or_icon, true);
    }

    $("#organization-profile .deactivate_realm_button").on("click", deactivate_organization);
}
