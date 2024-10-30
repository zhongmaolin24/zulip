import ClipboardJS from "clipboard";
import {parseISO} from "date-fns";
import $ from "jquery";
import _ from "lodash";
import assert from "minimalistic-assert";
import type * as tippy from "tippy.js";
import {z} from "zod";

import render_profile_access_error_model from "../templates/profile_access_error_modal.hbs";
import render_admin_human_form from "../templates/settings/admin_human_form.hbs";
import render_edit_bot_form from "../templates/settings/edit_bot_form.hbs";
import render_settings_edit_embedded_bot_service from "../templates/settings/edit_embedded_bot_service.hbs";
import render_settings_edit_outgoing_webhook_service from "../templates/settings/edit_outgoing_webhook_service.hbs";
import render_user_custom_profile_fields from "../templates/user_custom_profile_fields.hbs";
import render_user_full_name from "../templates/user_full_name.hbs";
import render_user_group_list_item from "../templates/user_group_list_item.hbs";
import render_user_profile_modal from "../templates/user_profile_modal.hbs";
import render_user_stream_list_item from "../templates/user_stream_list_item.hbs";

import * as avatar from "./avatar";
import * as bot_data from "./bot_data";
import * as browser_history from "./browser_history";
import * as buddy_data from "./buddy_data";
import * as channel from "./channel";
import * as components from "./components";
import {show_copied_confirmation} from "./copied_tooltip";
import {csrf_token} from "./csrf";
import * as custom_profile_fields_ui from "./custom_profile_fields_ui";
import * as dialog_widget from "./dialog_widget";
import * as dropdown_widget from "./dropdown_widget";
import type {DropdownWidget, DropdownWidgetOptions} from "./dropdown_widget";
import {get_current_hash_category} from "./hash_parser";
import * as hash_util from "./hash_util";
import {$t, $t_html} from "./i18n";
import type {InputPillContainer} from "./input_pill";
import * as integration_url_modal from "./integration_url_modal";
import * as ListWidget from "./list_widget";
import type {ListWidget as ListWidgetType} from "./list_widget";
import * as loading from "./loading";
import * as modals from "./modals";
import * as peer_data from "./peer_data";
import * as people from "./people";
import type {User} from "./people";
import * as settings_components from "./settings_components";
import * as settings_config from "./settings_config";
import * as settings_data from "./settings_data";
import * as settings_profile_fields from "./settings_profile_fields";
import type {CustomProfileField, CustomProfileFieldTypes} from "./state_data";
import {current_user, realm} from "./state_data";
import * as stream_data from "./stream_data";
import * as sub_store from "./sub_store";
import type {StreamSubscription} from "./sub_store";
import * as subscriber_api from "./subscriber_api";
import * as timerender from "./timerender";
import type {HTMLSelectOneElement} from "./types";
import * as ui_report from "./ui_report";
import type {UploadWidget} from "./upload_widget";
import * as user_deactivation_ui from "./user_deactivation_ui";
import * as user_groups from "./user_groups";
import type {UserGroup} from "./user_groups";
import * as user_pill from "./user_pill";
import * as util from "./util";

type CustomProfileFieldData = {
    id: number;
    name: string;
    is_user_field: boolean;
    is_link: boolean;
    is_external_account: boolean;
    type: number;
    display_in_profile_summary: boolean | undefined;
    required: boolean;
    value: string;
    rendered_value?: string | null | undefined;
    subtype?: string;
    link?: string;
};

let user_streams_list_widget: ListWidgetType<StreamSubscription> | undefined;
let user_profile_subscribe_widget: DropdownWidget | undefined;
let toggler: components.Toggle;
let bot_owner_dropdown_widget: DropdownWidget | undefined;
let original_values: (Record<string, unknown> & {user_id?: string | undefined}) | undefined;

const INCOMING_WEBHOOK_BOT_TYPE = 2;
const OUTGOING_WEBHOOK_BOT_TYPE = "3";
const EMBEDDED_BOT_TYPE = "4";

export function show_button_spinner($button: JQuery): void {
    const $spinner = $button.find(".modal__spinner");
    const dialog_submit_button_span_width = $button.find("span").width();
    const dialog_submit_button_span_height = $button.find("span").height();
    $button.prop("disabled", true);
    $button.find("span").hide();
    loading.make_indicator($spinner, {
        width: dialog_submit_button_span_width,
        height: dialog_submit_button_span_height,
    });
}

export function hide_button_spinner($button: JQuery): void {
    const $spinner = $button.find(".modal__spinner");
    $button.prop("disabled", false);
    $button.find("span").show();
    loading.destroy_indicator($spinner);
}

function compare_by_name(
    a: StreamSubscription | UserGroup,
    b: StreamSubscription | UserGroup,
): number {
    return util.strcmp(a.name, b.name);
}

export function get_user_id_if_user_profile_modal_open(): number | undefined {
    if (modals.any_active() && modals.active_modal() === "#user-profile-modal") {
        const user_id = Number($("#user-profile-modal").attr("data-user-id"));
        return user_id;
    }
    return undefined;
}

export function update_user_profile_streams_list_for_users(user_ids: number[]): void {
    const user_id = get_user_id_if_user_profile_modal_open();
    if (user_id && user_ids.includes(user_id) && user_streams_list_widget !== undefined) {
        const user_streams = stream_data.get_streams_for_user(user_id).subscribed;
        user_streams.sort(compare_by_name);
        user_streams_list_widget.replace_list_data(user_streams);
    }
}

export function update_profile_modal_ui(
    user: User,
    new_data: {
        user_id?: number;
        bot_owner_id?: string;
        avatar_url?: string;
        delivery_email?: string;
        role?: number;
        full_name?: string;
    },
): void {
    if (!(modals.any_active() && modals.active_modal() === "#user-profile-modal")) {
        return;
    }
    if (original_values?.user_id === undefined) {
        // This occurs if say, the "channel" tab is open.
        return;
    }
    const current_user_id = Number.parseInt(original_values.user_id, 10);
    if (current_user_id !== user.user_id) {
        return;
    }
    if (new_data.bot_owner_id !== undefined) {
        const $bot_owner_field = $(".bot_owner_user_field");
        $bot_owner_field.attr("data-field-id", new_data.bot_owner_id);
    }
    if (new_data.avatar_url !== undefined) {
        $("#avatar").css(
            "background-image",
            `url(${CSS.escape(people.medium_avatar_url_for_person(user))})`,
        );
    }
    if (new_data.delivery_email !== undefined) {
        $("#email").find(".value").text(new_data.delivery_email);
    }
    if (new_data.role !== undefined && !user.is_bot) {
        const user_type = settings_config.user_role_map.get(new_data.role);
        assert(user_type !== undefined);
        $("#user-type").find(".value").text(user_type);
    }
    if (new_data.full_name !== undefined || new_data.role !== undefined) {
        const user_type = {
            name: user.full_name,
            should_add_guest_user_indicator: people.should_add_guest_user_indicator(user.user_id),
        };
        $("#name .user-profile-name").html(render_user_full_name(user_type));
    }
}

function initialize_bot_owner(
    element_id: string,
    bot_id: number,
): Map<number, InputPillContainer<user_pill.UserPill>> {
    const user_pills = new Map<number, InputPillContainer<user_pill.UserPill>>();
    const bot = people.get_by_user_id(bot_id);
    assert(bot.is_bot);
    const bot_owner = people.get_bot_owner_user(bot);
    // Bot owner's pill displaying on bot's profile modal.
    if (bot_owner) {
        const $pill_container = $(element_id)
            .find(
                `.bot_owner_user_field[data-field-id="${CSS.escape(
                    bot_owner.user_id.toString(),
                )}"] .pill-container`,
            )
            .expectOne();
        const pills = user_pill.create_pills($pill_container);

        user_pill.append_user(bot_owner, pills);
        user_pills.set(bot_owner.user_id, pills);
    }
    return user_pills;
}

function render_user_profile_subscribe_widget(): void {
    const opts: DropdownWidgetOptions = {
        widget_name: "user_profile_subscribe",
        get_options: get_user_unsub_streams,
        item_click_callback: change_state_of_subscribe_button,
        $events_container: $("#user-profile-modal"),
        unique_id_type: dropdown_widget.DataTypes.NUMBER,
    };
    user_profile_subscribe_widget =
        user_profile_subscribe_widget ?? new dropdown_widget.DropdownWidget(opts);
    user_profile_subscribe_widget.setup();
}

function change_state_of_subscribe_button(
    event: JQuery.ClickEvent,
    dropdown: tippy.Instance,
): void {
    dropdown.hide();
    event.preventDefault();
    event.stopPropagation();
    assert(user_profile_subscribe_widget !== undefined);
    user_profile_subscribe_widget.render();
    const $subscribe_button = $("#user-profile-modal .add-subscription-button");
    const $element: (tippy.ReferenceElement & HTMLElement) | undefined =
        $subscribe_button.parent()[0];
    assert($element !== undefined);
    $element._tippy?.destroy();
    $subscribe_button.prop("disabled", false);
}

function reset_subscribe_widget(): void {
    $("#user-profile-modal .add-subscription-button").prop("disabled", true);
    settings_components.initialize_disable_btn_hint_popover(
        $("#user-profile-modal .add-subscription-button-wrapper"),
        $t({defaultMessage: "Select a channel to subscribe"}),
        {},
    );
    $("#user_profile_subscribe_widget .dropdown_widget_value").text(
        $t({defaultMessage: "Select a channel"}),
    );
    //  There are two cases when the subscribe widget is reset: when the user_profile
    //  is setup (the object is null), or after subscribing of a user in the dropdown.
    //
    //  After subscribing a user, we want the current_value of dropdown to be reset
    //  to undefined after the subscribe widget is reloaded. This is to avoid an error
    //  of not finding the current_value of the user_profile in the options.
    if (user_profile_subscribe_widget) {
        user_profile_subscribe_widget.current_value = undefined;
    }
}

export function get_user_unsub_streams(): {
    name: string;
    unique_id: number;
    stream: StreamSubscription;
}[] {
    const target_user_id = Number.parseInt($("#user-profile-modal").attr("data-user-id")!, 10);
    return stream_data
        .get_streams_for_user(target_user_id)
        .can_subscribe.map((stream) => ({
            name: stream.name,
            unique_id: stream.stream_id,
            stream,
        }))
        .sort((a, b) => {
            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                return -1;
            }
            if (a.name.toLowerCase() > b.name.toLowerCase()) {
                return 1;
            }
            return 0;
        });
}

function format_user_stream_list_item_html(stream: StreamSubscription, user: User): string {
    const show_unsubscribe_button =
        people.can_admin_user(user) || stream_data.can_unsubscribe_others(stream);
    const show_private_stream_unsub_tooltip =
        people.is_my_user_id(user.user_id) && stream.invite_only;
    const show_last_user_in_private_stream_unsub_tooltip =
        stream.invite_only && peer_data.get_subscriber_count(stream.stream_id) === 1;
    return render_user_stream_list_item({
        name: stream.name,
        stream_id: stream.stream_id,
        stream_color: stream.color,
        invite_only: stream.invite_only,
        is_web_public: stream.is_web_public,
        show_unsubscribe_button,
        show_private_stream_unsub_tooltip,
        show_last_user_in_private_stream_unsub_tooltip,
        stream_edit_url: hash_util.channels_settings_edit_url(stream, "general"),
    });
}

function format_user_group_list_item_html(group: UserGroup): string {
    return render_user_group_list_item({
        group_id: group.id,
        name: group.name,
        group_edit_url: hash_util.group_edit_url(group, "general"),
        is_guest: current_user.is_guest,
    });
}

function render_user_stream_list(streams: StreamSubscription[], user: User): void {
    streams.sort(compare_by_name);
    const $container = $("#user-profile-modal .user-stream-list");
    $container.empty();
    user_streams_list_widget = ListWidget.create($container, streams, {
        name: `user-${user.user_id}-stream-list`,
        get_item: ListWidget.default_get_item,
        modifier_html(item) {
            return format_user_stream_list_item_html(item, user);
        },
        callback_after_render() {
            $container.parent().removeClass("empty-list");
        },
        filter: {
            $element: $("#user-profile-streams-tab .stream-search"),
            predicate(item, value) {
                return item?.name.toLocaleLowerCase().includes(value);
            },
            onupdate() {
                if ($container.find(".empty-table-message").length) {
                    $container.parent().addClass("empty-list");
                }
            },
        },
        $simplebar_container: $("#user-profile-modal .modal__body"),
    });
}

function render_user_group_list(groups: UserGroup[], user: User): void {
    groups.sort(compare_by_name);
    const $container = $("#user-profile-modal .user-group-list");
    $container.empty();
    ListWidget.create($container, groups, {
        name: `user-${user.user_id}-group-list`,
        get_item: ListWidget.default_get_item,
        callback_after_render() {
            $container.parent().removeClass("empty-list");
        },
        modifier_html(item) {
            return format_user_group_list_item_html(item);
        },
        $simplebar_container: $("#user-profile-modal .modal__body"),
    });
}

function render_manage_profile_content(user: User): void {
    // Since we want the height of the profile modal to remain consistent when switching tabs,
    // we need to restrict the height of the main body. This will ensure that the footer of
    // the "Manage User" tab can adjust within the provided height without expanding the modal.
    $("#user-profile-modal .modal__body").addClass("modal__body__manage_profile_height");
    $("#user-profile-modal .manage-profile-tab-footer").addClass("modal__footer_wrapper");
    const $container = $("#manage-profile-tab");
    $container.empty();
    if (user.is_bot) {
        show_edit_bot_info_modal(user.user_id, $container);
    } else {
        show_edit_user_info_modal(user.user_id, $container);
    }
}

export function get_custom_profile_field_data(
    user: User,
    field: CustomProfileField,
    field_types: CustomProfileFieldTypes,
): CustomProfileFieldData | undefined {
    const field_value = people.get_custom_profile_data(user.user_id, field.id);
    const field_type = field.type;

    if (!field_value) {
        return undefined;
    }
    if (!field_value.value) {
        return undefined;
    }
    const profile_field: CustomProfileFieldData = {
        id: field.id,
        name: field.name,
        is_user_field: false,
        is_link: field_type === field_types.URL.id,
        is_external_account: field_type === field_types.EXTERNAL_ACCOUNT.id,
        type: field_type,
        display_in_profile_summary: field.display_in_profile_summary,
        required: field.required,
        value: field_value.value,
    };
    switch (field_type) {
        case field_types.DATE.id:
            profile_field.value = timerender.get_localized_date_or_time_for_format(
                parseISO(field_value.value),
                "dayofyear_year",
            );
            break;
        case field_types.USER.id:
            profile_field.is_user_field = true;
            profile_field.value = field_value.value;
            break;
        case field_types.SELECT.id: {
            const field_choice_dict = settings_components.select_field_data_schema.parse(
                JSON.parse(field.field_data),
            );
            profile_field.value = field_choice_dict[field_value.value]!.text;
            break;
        }
        case field_types.SHORT_TEXT.id:
        case field_types.LONG_TEXT.id:
            profile_field.value = field_value.value;
            profile_field.rendered_value = field_value.rendered_value;
            break;
        case field_types.EXTERNAL_ACCOUNT.id: {
            const field_data = settings_components.external_account_field_schema.parse(
                JSON.parse(field.field_data),
            );
            profile_field.value = field_value.value;
            profile_field.subtype = field_data.subtype;
            profile_field.link = settings_profile_fields.get_external_account_link(
                field_data,
                field_value.value,
            );
            break;
        }
        default:
            profile_field.value = field_value.value;
    }
    return profile_field;
}

export function update_user_custom_profile_fields(user: User): void {
    if (!(modals.any_active() && modals.active_modal() === "#user-profile-modal")) {
        return;
    }
    if (original_values?.user_id === undefined) {
        return;
    }
    const current_user_id = Number.parseInt(original_values.user_id, 10);
    if (current_user_id !== user.user_id) {
        return;
    }
    const $custom_profile_field = $("#content");
    const field_types = realm.custom_profile_field_types;

    const profile_fields = realm.custom_profile_fields
        .flatMap((f) => get_custom_profile_field_data(user, f, field_types) ?? [])
        .filter((f) => f.name !== undefined);

    const profile_data = {profile_fields};
    $custom_profile_field.html(render_user_custom_profile_fields(profile_data));
    custom_profile_fields_ui.initialize_custom_user_type_fields(
        "#user-profile-modal #content",
        user.user_id,
        false,
    );
}

export function hide_user_profile(): void {
    modals.close_if_open("user-profile-modal");
}

function on_user_profile_hide(): void {
    user_streams_list_widget = undefined;
    user_profile_subscribe_widget = undefined;
    const base = get_current_hash_category();
    // After closing the user profile, if the hash consists of `#user`
    // it means that it acts as an overlay rather than a modal (when
    // no other overlay is in the background). Hence, we also need to
    // update the hash when we close it.
    if (base === "user") {
        browser_history.exit_overlay();
    }
}

function show_manage_user_tab(target: string): void {
    toggler.goto(target);
}

function initialize_user_type_fields(user: User): void {
    // Avoid duplicate pill fields, by removing existing ones.
    $("#user-profile-modal .pill").remove();
    if (!user.is_bot) {
        custom_profile_fields_ui.initialize_custom_user_type_fields(
            "#user-profile-modal #content",
            user.user_id,
            false,
        );
    } else {
        initialize_bot_owner("#user-profile-modal #content", user.user_id);
    }
}

export function show_user_profile_access_error_modal(): void {
    $("body").append($(render_profile_access_error_model()));

    // This opens the model, referencing it by it's ID('profile_access_error_model)
    modals.open("profile_access_error_modal", {
        autoremove: true,
        on_hide() {
            browser_history.exit_overlay();
        },
    });
}

export function show_user_profile(user: User, default_tab_key = "profile-tab"): void {
    const field_types = realm.custom_profile_field_types;
    const profile_data = realm.custom_profile_fields
        .flatMap((f) => get_custom_profile_field_data(user, f, field_types) ?? [])
        .filter((f) => f.name !== undefined);
    original_values = {
        user_id: user.user_id.toString(),
    };
    const user_streams = stream_data.get_streams_for_user(user.user_id).subscribed;
    // We only show the subscribe widget if the user is an admin, the user has opened their own profile,
    // or if the user profile belongs to a bot whose owner has opened the user profile. However, we don't
    // want to show the subscribe widget for generic bots since they are system bots and for deactivated users.
    // Therefore, we also check for that condition.
    const show_user_subscribe_widget =
        (people.can_admin_user(user) || settings_data.user_can_subscribe_other_users()) &&
        !user.is_system_bot &&
        people.is_person_active(user.user_id);
    const groups_of_user = user_groups.get_user_groups_of_user(user.user_id);
    // We currently have the main UI for editing your own profile in
    // settings, so can_manage_profile is artificially false for those.
    const can_manage_profile =
        (people.can_admin_user(user) || current_user.is_admin) &&
        !user.is_system_bot &&
        !people.is_my_user_id(user.user_id);
    const args: Record<string, unknown> = {
        can_manage_profile,
        date_joined: timerender.get_localized_date_or_time_for_format(
            parseISO(user.date_joined),
            "dayofyear_year",
        ),
        email: user.delivery_email,
        full_name: user.full_name,
        is_active: people.is_person_active(user.user_id),
        is_bot: user.is_bot,
        is_me: people.is_current_user(user.email),
        last_seen: buddy_data.user_last_seen_time_status(user.user_id),
        profile_data,
        should_add_guest_user_indicator: people.should_add_guest_user_indicator(user.user_id),
        show_user_subscribe_widget,
        user_avatar: people.medium_avatar_url_for_person(user),
        user_circle_class: buddy_data.get_user_circle_class(user.user_id),
        user_id: user.user_id,
        user_is_guest: user.is_guest,
        user_time: people.get_user_time(user.user_id),
        user_type: people.get_user_type(user.user_id),
    };

    if (user.is_bot) {
        const is_system_bot = user.is_system_bot;
        const bot_owner_id = user.bot_owner_id;
        if (is_system_bot) {
            args.is_system_bot = is_system_bot;
        } else if (bot_owner_id) {
            const bot_owner = people.get_bot_owner_user(user);
            args.bot_owner = bot_owner;
        }
        args.bot_type = settings_data.bot_type_id_to_string(user.bot_type);
    }

    $("#user-profile-modal-holder").html(render_user_profile_modal(args));
    modals.open("user-profile-modal", {autoremove: true, on_hide: on_user_profile_hide});
    $(".tabcontent").hide();
    $("#user-profile-modal .dialog_submit_button").prop("disabled", true);

    let default_tab = 0;

    if (default_tab_key === "user-profile-streams-tab") {
        default_tab = 1;
    } else if (default_tab_key === "manage-profile-tab") {
        default_tab = 3;
    }

    const opts = {
        selected: default_tab,
        child_wants_focus: true,
        values: [
            {label: $t({defaultMessage: "Profile"}), key: "profile-tab"},
            {label: $t({defaultMessage: "Channels"}), key: "user-profile-streams-tab"},
            {label: $t({defaultMessage: "User groups"}), key: "user-profile-groups-tab"},
        ],
        callback(_name: string, key: string) {
            $(".tabcontent").hide();
            $(`#${CSS.escape(key)}`).show();
            $("#user-profile-modal .modal__footer").hide();
            $("#user-profile-modal .modal__body").removeClass("modal__body__manage_profile_height");
            $("#user-profile-modal .manage-profile-tab-footer").removeClass(
                "modal__footer_wrapper",
            );
            switch (key) {
                case "profile-tab":
                    initialize_user_type_fields(user);
                    break;
                case "user-profile-groups-tab":
                    render_user_group_list(groups_of_user, user);
                    break;
                case "user-profile-streams-tab":
                    if (show_user_subscribe_widget) {
                        render_user_profile_subscribe_widget();
                    }
                    render_user_stream_list(user_streams, user);
                    break;
                case "manage-profile-tab":
                    $("#user-profile-modal .modal__footer").show();
                    render_manage_profile_content(user);
                    break;
            }
            setTimeout(() => {
                $(".modal__container .ind-tab").attr("tabindex", "-1");
                $(".modal__container .ind-tab.selected").attr("tabindex", "0");
            }, 0);
        },
    };

    if (can_manage_profile) {
        const manage_profile_label = user.is_bot
            ? $t({defaultMessage: "Manage bot"})
            : $t({defaultMessage: "Manage user"});
        const manage_profile_tab = {
            label: manage_profile_label,
            key: "manage-profile-tab",
        };
        opts.values.push(manage_profile_tab);
    }

    toggler = components.toggle(opts);
    const $elem = toggler.get();
    $elem.addClass("large allow-overflow");
    $("#tab-toggle").append($elem);
    setTimeout(() => {
        $(".ind-tab.selected").trigger("focus");
    }, 0);
    if (show_user_subscribe_widget) {
        reset_subscribe_widget();
    }
}

function handle_remove_stream_subscription(
    target_user_id: number,
    sub: StreamSubscription,
    success: (data: unknown) => void,
    failure: () => void,
): void {
    if (people.is_my_user_id(target_user_id)) {
        // Self unsubscribe.
        void channel.del({
            url: "/json/users/me/subscriptions",
            data: {subscriptions: JSON.stringify([sub.name])},
            success,
            error: failure,
        });
    } else {
        subscriber_api.remove_user_id_from_stream(target_user_id, sub, success, failure);
    }
}

export function show_edit_bot_info_modal(user_id: number, $container: JQuery): void {
    const bot = people.maybe_get_user_by_id(user_id);
    const bot_user = bot_data.get(user_id);
    if (!bot || !bot_user) {
        return;
    }

    const owner_id = bot_user.owner_id;
    assert(owner_id !== null);
    const owner_full_name = people.get_full_name(owner_id);
    const is_active = people.is_person_active(user_id);

    assert(bot.is_bot);
    const html_body = render_edit_bot_form({
        user_id,
        is_active,
        email: bot.email,
        full_name: bot.full_name,
        user_role_values: settings_config.user_role_values,
        disable_role_dropdown: !current_user.is_admin || (bot.is_owner && !current_user.is_owner),
        bot_avatar_url: bot.avatar_url,
        owner_full_name,
        current_bot_owner: bot.bot_owner_id,
        is_incoming_webhook_bot: bot.bot_type === INCOMING_WEBHOOK_BOT_TYPE,
    });
    $container.append($(html_body));
    let avatar_widget: UploadWidget;

    assert(bot.bot_type !== undefined && bot.bot_type !== null);

    const bot_type = bot.bot_type.toString();
    const services = bot_data.get_services(bot.user_id);
    let service:
        | {
              config_data: Record<string, string>;
              service_name: string;
          }
        | {
              base_url: string;
              interface: number;
              token: string;
          };
    if (services?.[0] !== undefined) {
        service = services[0];
    }
    edit_bot_post_render();
    original_values = get_current_values($("#bot-edit-form"));
    $("#bot-edit-form").on("input", "input, select, button", (e) => {
        e.preventDefault();
        toggle_submit_button($("#bot-edit-form"));
    });
    $("#user-profile-modal").on("click", ".dialog_submit_button", () => {
        const role = Number.parseInt(
            $<HTMLSelectOneElement>("select:not([multiple])#bot-role-select").val()!.trim(),
            10,
        );
        const $full_name = $("#bot-edit-form").find<HTMLInputElement>("input[name='full_name']");
        const url = "/json/bots/" + encodeURIComponent(bot.user_id);

        const formData = new FormData();
        assert(csrf_token !== undefined);
        formData.append("csrfmiddlewaretoken", csrf_token);
        formData.append("full_name", $full_name.val()!);
        formData.append("role", JSON.stringify(role));
        const new_bot_owner_id = bot_owner_dropdown_widget!.value();
        if (new_bot_owner_id) {
            formData.append("bot_owner_id", new_bot_owner_id.toString());
        }

        if (bot_type === OUTGOING_WEBHOOK_BOT_TYPE) {
            const service_payload_url = $("#edit_service_base_url").val();
            const service_interface = $<HTMLSelectOneElement>(
                "select:not([multiple])#edit_service_interface",
            ).val()!;
            formData.append("service_payload_url", JSON.stringify(service_payload_url));
            formData.append("service_interface", service_interface);
        } else if (bot_type === EMBEDDED_BOT_TYPE && service !== undefined) {
            const config_data: Record<string, string> = {};
            $<HTMLInputElement>("#config_edit_inputbox input").each(function () {
                config_data[$(this).attr("name")!] = $(this).val()!;
            });
            formData.append("config_data", JSON.stringify(config_data));
        }

        const files = util.the(
            $("#bot-edit-form").find<HTMLInputElement>("input.edit_bot_avatar_file_input"),
        ).files;
        assert(files !== null);
        for (const [i, file] of [...files].entries()) {
            formData.append("file-" + i, file);
        }

        const $submit_btn = $("#user-profile-modal .dialog_submit_button");
        const $cancel_btn = $("#user-profile-modal .dialog_exit_button");
        show_button_spinner($submit_btn);
        $cancel_btn.prop("disabled", true);

        void channel.patch({
            url,
            data: formData,
            processData: false,
            contentType: false,
            success() {
                avatar_widget.clear();
                hide_button_spinner($submit_btn);
                original_values = get_current_values($("#bot-edit-form"));
                toggle_submit_button($("#bot-edit-form"));
                ui_report.success(
                    $t_html({defaultMessage: "Saved"}),
                    $("#user-profile-modal .save-success"),
                    1200,
                );
                $cancel_btn.prop("disabled", false);
            },
            error(xhr) {
                ui_report.error(
                    $t_html({defaultMessage: "Failed"}),
                    xhr,
                    $("#bot-edit-form-error"),
                );
                // Scrolling modal to top, to make error visible to user.
                $("#bot-edit-form")
                    .closest(".simplebar-content-wrapper")
                    .animate({scrollTop: 0}, "fast");
                hide_button_spinner($submit_btn);
                $cancel_btn.prop("disabled", false);
            },
        });
    });

    function edit_bot_post_render(): void {
        $("#edit_bot_modal .dialog_submit_button").prop("disabled", true);

        function get_options(): {
            name: string;
            unique_id: number;
        }[] {
            assert(bot?.is_bot);
            const user_ids = people.get_realm_active_human_user_ids();
            if (bot.bot_owner_id !== null && !user_ids.includes(bot.bot_owner_id)) {
                // Always include the current bot owner in
                // options, even if the owner is deactivated.
                user_ids.push(bot.bot_owner_id);
            }
            return user_ids.map((user_id) => ({
                name: people.get_full_name(user_id),
                unique_id: user_id,
            }));
        }

        function item_click_callback(event: JQuery.ClickEvent, dropdown: tippy.Instance): void {
            assert(bot_owner_dropdown_widget !== undefined);
            bot_owner_dropdown_widget.render();
            // Let dialog_widget know that there was a change in value.
            $(bot_owner_dropdown_widget.widget_selector).trigger("input");
            dropdown.hide();
            event.stopPropagation();
            event.preventDefault();
        }
        assert(owner_id !== null);
        bot_owner_dropdown_widget = new dropdown_widget.DropdownWidget({
            widget_name: "edit_bot_owner",
            get_options,
            item_click_callback,
            $events_container: $("#bot-edit-form"),
            default_id: owner_id,
            unique_id_type: dropdown_widget.DataTypes.NUMBER,
        });
        bot_owner_dropdown_widget.setup();

        assert(bot !== undefined);
        $("#bot-role-select").val(bot.role);
        if (!current_user.is_owner) {
            $("#bot-role-select")
                .find(
                    `option[value="${CSS.escape(settings_config.user_role_values.owner.code.toString())}"]`,
                )
                .hide();
        }

        avatar_widget = avatar.build_bot_edit_widget($("#bot-edit-form"));

        if (bot_type === OUTGOING_WEBHOOK_BOT_TYPE) {
            $("#service_data").append(
                $(
                    render_settings_edit_outgoing_webhook_service({
                        service,
                    }),
                ),
            );
            assert(service && "interface" in service);
            $("#edit_service_interface").val(service.interface);
        }
        if (bot_type === EMBEDDED_BOT_TYPE) {
            $("#service_data").append(
                $(
                    render_settings_edit_embedded_bot_service({
                        service,
                    }),
                ),
            );
        }

        // Hide the avatar if the user has uploaded an image
        $("#bot-edit-form").on("input", ".edit_bot_avatar_file_input", () => {
            $("#current_bot_avatar_image").hide();
        });

        // Show the avatar if the user has cleared the image
        $("#bot-edit-form").on("click", ".edit_bot_avatar_clear_button", () => {
            $("#current_bot_avatar_image").show();
            $(".edit_bot_avatar_file_input").trigger("input");
        });

        $("#bot-edit-form").on("click", ".deactivate_bot_button", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const bot_id = Number($("#bot-edit-form").attr("data-user-id"));
            function handle_confirm(): void {
                const url = "/json/bots/" + encodeURIComponent(bot_id);
                dialog_widget.submit_api_request(channel.del, url, {});
            }
            user_deactivation_ui.confirm_bot_deactivation(bot_id, handle_confirm, true);
        });

        // Handle reactivation
        $("#bot-edit-form").on("click", ".reactivate_user_button", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const user_id = Number($("#bot-edit-form").attr("data-user-id"));
            function handle_confirm(): void {
                const url = "/json/users/" + encodeURIComponent(user_id) + "/reactivate";
                dialog_widget.submit_api_request(channel.post, url, {});
            }
            user_deactivation_ui.confirm_reactivation(user_id, handle_confirm, true);
        });

        $("#bot-edit-form").on("click", ".generate_url_for_integration", (e) => {
            e.preventDefault();
            e.stopPropagation();
            assert(bot !== undefined);
            const current_bot_data = bot_data.get(bot.user_id);
            assert(current_bot_data !== undefined);
            integration_url_modal.show_generate_integration_url_modal(current_bot_data.api_key);
        });
    }
}

function get_human_profile_data(fields_user_pills: Map<number, user_pill.UserPillWidget>): {
    id: number;
    value: number[];
}[] {
    /*
        This formats custom profile field data to send to the server.
        See render_admin_human_form and open_human_form
        to see how the form is built.

        TODO: Ideally, this logic would be cleaned up or deduplicated with
        the settings_account.ts logic.
    */
    const new_profile_data = [];
    $("#edit-user-form .custom_user_field_value").each(function () {
        // Remove duplicate datepicker input element generated flatpickr library
        if (!$(this).hasClass("form-control")) {
            new_profile_data.push({
                id: Number.parseInt(
                    $(this).closest(".custom_user_field").attr("data-field-id")!,
                    10,
                ),
                value: $(this).val(),
            });
        }
    });
    // Append user type field values also
    for (const [field_id, field_pills] of fields_user_pills) {
        if (field_pills) {
            const user_ids = user_pill.get_user_ids(field_pills);
            new_profile_data.push({
                id: field_id,
                value: user_ids,
            });
        }
    }

    return new_profile_data;
}

function get_current_values(
    $edit_form: JQuery,
): Record<string, unknown> & {user_id?: string | undefined} {
    const raw_current_values = dialog_widget.get_current_values(
        $edit_form.find("input, select, textarea, button, .pill-container"),
    );
    const schema = z.intersection(
        z.object({
            user_id: z.optional(z.string()),
        }),
        z.record(z.string(), z.unknown()),
    );
    const current_values = schema.parse(raw_current_values);
    return current_values;
}

function toggle_submit_button($edit_form: JQuery): void {
    const current_values = get_current_values($edit_form);
    const $submit_btn = $("#user-profile-modal .dialog_submit_button");
    if (!_.isEqual(original_values, current_values)) {
        $submit_btn.prop("disabled", false);
    } else {
        $submit_btn.prop("disabled", true);
    }
}

export function show_edit_user_info_modal(user_id: number, $container: JQuery): void {
    const person = people.maybe_get_user_by_id(user_id);
    const is_active = people.is_person_active(user_id);

    if (!person) {
        return;
    }

    const html_body = render_admin_human_form({
        user_id,
        email: person.delivery_email,
        full_name: person.full_name,
        user_role_values: settings_config.user_role_values,
        disable_role_dropdown: person.is_owner && !current_user.is_owner,
        owner_is_only_user_in_organization: people.get_active_human_count() === 1,
        is_active,
    });

    $container.append($(html_body));
    // Set role dropdown and fields user pills
    $("#user-role-select").val(person.role);
    if (!current_user.is_owner) {
        $("#user-role-select")
            .find(
                `option[value="${CSS.escape(settings_config.user_role_values.owner.code.toString())}"]`,
            )
            .hide();
    }

    const custom_profile_field_form_selector = "#edit-user-form .custom-profile-field-form";
    $(custom_profile_field_form_selector).empty();
    custom_profile_fields_ui.append_custom_profile_fields(
        custom_profile_field_form_selector,
        user_id,
    );
    custom_profile_fields_ui.initialize_custom_date_type_fields(custom_profile_field_form_selector);
    custom_profile_fields_ui.initialize_custom_pronouns_type_fields(
        custom_profile_field_form_selector,
    );
    const fields_user_pills = custom_profile_fields_ui.initialize_custom_user_type_fields(
        custom_profile_field_form_selector,
        user_id,
        true,
        () => {
            toggle_submit_button($("#edit-user-form"));
        },
    );
    original_values = get_current_values($("#edit-user-form"));

    // Handle deactivation
    $("#edit-user-form").on("click", ".deactivate_user_button", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const user_id = Number($("#edit-user-form").attr("data-user-id"));
        function handle_confirm(): void {
            const url = "/json/users/" + encodeURIComponent(user_id);
            dialog_widget.submit_api_request(channel.del, url, {});
        }
        user_deactivation_ui.confirm_deactivation(user_id, handle_confirm, true);
    });

    // Handle reactivation
    $("#edit-user-form").on("click", ".reactivate_user_button", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const user_id = Number($("#edit-user-form").attr("data-user-id"));
        function handle_confirm(): void {
            const url = "/json/users/" + encodeURIComponent(user_id) + "/reactivate";
            dialog_widget.submit_api_request(channel.post, url, {});
        }
        user_deactivation_ui.confirm_reactivation(user_id, handle_confirm, true);
    });

    $("#edit-user-form").on("input", "input, select, textarea", (e) => {
        e.preventDefault();
        toggle_submit_button($("#edit-user-form"));
    });

    $("#user-profile-modal").on("click", ".dialog_submit_button", () => {
        const role = Number.parseInt(
            $<HTMLSelectOneElement>("select:not([multiple])#user-role-select").val()!.trim(),
            10,
        );
        const $full_name = $("#edit-user-form").find("input[name='full_name']");
        const profile_data = get_human_profile_data(fields_user_pills);

        const url = "/json/users/" + encodeURIComponent(user_id);
        const data = {
            full_name: $full_name.val(),
            role: JSON.stringify(role),
            profile_data: JSON.stringify(profile_data),
        };

        const $submit_btn = $("#user-profile-modal .dialog_submit_button");
        const $cancel_btn = $("#user-profile-modal .dialog_exit_button");
        show_button_spinner($submit_btn);
        $cancel_btn.prop("disabled", true);

        void channel.patch({
            url,
            data,
            success() {
                hide_button_spinner($submit_btn);
                original_values = get_current_values($("#edit-user-form"));
                toggle_submit_button($("#edit-user-form"));
                ui_report.success(
                    $t_html({defaultMessage: "Saved"}),
                    $("#user-profile-modal .save-success"),
                    1200,
                );
                $cancel_btn.prop("disabled", false);
            },
            error(xhr) {
                ui_report.error(
                    $t_html({defaultMessage: "Failed"}),
                    xhr,
                    $("#edit-user-form-error"),
                );
                // Scrolling modal to top, to make error visible to user.
                $("#edit-user-form")
                    .closest(".simplebar-content-wrapper")
                    .animate({scrollTop: 0}, "fast");
                hide_button_spinner($submit_btn);
                $cancel_btn.prop("disabled", false);
            },
        });
    });
}

export function initialize(): void {
    $("body").on("click", "#user-profile-modal .add-subscription-button", (e) => {
        e.preventDefault();
        assert(user_profile_subscribe_widget !== undefined);
        const stream_id = user_profile_subscribe_widget.value();
        assert(typeof stream_id === "number");
        const sub = sub_store.get(stream_id);
        assert(sub !== undefined);
        const target_user_id = Number.parseInt($("#user-profile-modal").attr("data-user-id")!, 10);
        const $alert_box = $("#user-profile-streams-tab .stream_list_info");
        function addition_success(raw_data: unknown): void {
            const data = z
                .object({
                    already_subscribed: z.record(z.string(), z.array(z.string())),
                    subscribed: z.record(z.string(), z.array(z.string())),
                    msg: z.string(),
                    result: z.string(),
                })
                .parse(raw_data);
            if (Object.keys(data.subscribed).length > 0) {
                reset_subscribe_widget();
                ui_report.success(
                    $t_html({defaultMessage: "Subscribed successfully!"}),
                    $alert_box,
                    1200,
                );
            } else {
                ui_report.client_error(
                    $t_html({defaultMessage: "Already subscribed."}),
                    $alert_box,
                    1200,
                );
            }
        }
        function addition_failure(xhr: JQuery.jqXHR): void {
            ui_report.error("", xhr, $alert_box, 1200);
        }
        subscriber_api.add_user_ids_to_stream(
            [target_user_id],
            sub,
            addition_success,
            addition_failure,
        );
    });

    $("body").on("click", "#user-profile-modal .remove-subscription-button", (e) => {
        e.preventDefault();
        const $stream_row = $(e.currentTarget).closest("[data-stream-id]");
        const stream_id = Number.parseInt($stream_row.attr("data-stream-id")!, 10);
        const sub = sub_store.get(stream_id);
        const target_user_id = Number.parseInt($("#user-profile-modal").attr("data-user-id")!, 10);
        const $alert_box = $("#user-profile-streams-tab .stream_list_info");

        function removal_success(raw_data: unknown): void {
            const data = z
                .object({
                    removed: z.array(z.string()),
                    msg: z.string(),
                    result: z.string(),
                    not_removed: z.array(z.string()),
                })
                .parse(raw_data);
            if (data.removed.length > 0) {
                ui_report.success(
                    $t_html({defaultMessage: "Unsubscribed successfully!"}),
                    $alert_box,
                    1200,
                );
            } else {
                ui_report.client_error(
                    $t_html({defaultMessage: "Already not subscribed."}),
                    $alert_box,
                    1200,
                );
            }
        }

        function removal_failure(): void {
            assert(sub !== undefined);
            let error_message;
            if (people.is_my_user_id(target_user_id)) {
                error_message = $t(
                    {defaultMessage: "Error in unsubscribing from #{channel_name}"},
                    {channel_name: sub.name},
                );
            } else {
                error_message = $t(
                    {defaultMessage: "Error removing user from #{channel_name}"},
                    {channel_name: sub.name},
                );
            }

            ui_report.client_error(error_message, $alert_box, 1200);
        }
        assert(sub !== undefined);
        if (
            sub.invite_only &&
            (people.is_my_user_id(target_user_id) ||
                peer_data.get_subscriber_count(stream_id) === 1)
        ) {
            const new_hash = hash_util.channels_settings_edit_url(sub, "general");
            hide_user_profile();
            browser_history.go_to_location(new_hash);
            return;
        }
        handle_remove_stream_subscription(target_user_id, sub, removal_success, removal_failure);
    });

    $("body").on("click", "#user-profile-modal #clear_stream_search", (e) => {
        const $input = $("#user-profile-streams-tab .stream-search");
        $input.val("");

        // This is a hack to rerender complete
        // stream list once the text is cleared.
        $input.trigger("input");

        e.stopPropagation();
        e.preventDefault();
    });

    $("body").on(
        "click",
        "#user-profile-modal #name .user-profile-manage-others-edit-button",
        (e) => {
            show_manage_user_tab("manage-profile-tab");
            e.stopPropagation();
            e.preventDefault();
        },
    );

    /* These click handlers are implemented as just deep links to the
     * relevant part of the Zulip UI, so we don't want preventDefault,
     * but we do want to close the modal when you click them. */
    $("body").on("click", "#user-profile-modal #name .user-profile-manage-own-edit-button", () => {
        hide_user_profile();
    });

    $("body").on("click", "#user-profile-modal .stream_list_item", () => {
        hide_user_profile();
    });

    $("body").on("click", "#user-profile-modal .group_list_item_link", () => {
        hide_user_profile();
    });

    $("body").on("input", "#user-profile-streams-tab .stream-search", () => {
        const $input = $<HTMLInputElement>("#user-profile-streams-tab input.stream-search");
        if ($input.val()!.trim().length > 0) {
            $("#user-profile-streams-tab #clear_stream_search").show();
            $input.css("margin-right", "-20px");
        } else {
            $("#user-profile-streams-tab #clear_stream_search").hide();
            $input.css("margin-right", "0");
        }
    });

    new ClipboardJS(".copy-link-to-user-profile", {
        text(trigger) {
            const user_id = $(trigger).attr("data-user-id");
            const user_profile_link = window.location.origin + "/#user/" + user_id;

            return user_profile_link;
        },
    }).on("success", (e) => {
        assert(e.trigger instanceof HTMLElement);
        show_copied_confirmation(e.trigger);
    });

    new ClipboardJS(".copy-custom-field-url", {
        text(trigger) {
            const $custom_link = $(trigger).parent().find(".custom-profile-fields-link");
            return $custom_link.attr("href") ?? "";
        },
    }).on("success", (e) => {
        assert(e.trigger instanceof HTMLElement);
        show_copied_confirmation(e.trigger, {
            show_check_icon: true,
        });
    });
}
