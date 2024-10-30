import assert from "minimalistic-assert";
import {z} from "zod";

import * as blueslip from "./blueslip";
import {FoldDict} from "./fold_dict";
import * as group_permission_settings from "./group_permission_settings";
import {$t} from "./i18n";
import {page_params} from "./page_params";
import * as settings_config from "./settings_config";
import type {GroupPermissionSetting, GroupSettingValue, StateData} from "./state_data";
import {current_user, raw_user_group_schema, realm} from "./state_data";
import type {UserOrMention} from "./typeahead_helper";
import type {UserGroupUpdateEvent} from "./types";

type UserGroupRaw = z.infer<typeof raw_user_group_schema>;

export const user_group_schema = raw_user_group_schema.extend({
    // These are delivered via the API as lists, but converted to sets
    // during initialization for more convenient manipulation.
    members: z.set(z.number()),
    direct_subgroup_ids: z.set(z.number()),
});
export type UserGroup = z.infer<typeof user_group_schema>;

export type UserGroupForDropdownListWidget = {
    name: string;
    unique_id: number;
};

let user_group_name_dict: FoldDict<UserGroup>;
let user_group_by_id_dict: Map<number, UserGroup>;

// We have an init() function so that our automated tests
// can easily clear data.
export function init(): void {
    user_group_name_dict = new FoldDict();
    user_group_by_id_dict = new Map<number, UserGroup>();
}

// WE INITIALIZE DATA STRUCTURES HERE!
init();

export function add(user_group_raw: UserGroupRaw): UserGroup {
    // Reformat the user group members structure to be a set.
    const user_group = {
        description: user_group_raw.description,
        id: user_group_raw.id,
        name: user_group_raw.name,
        creator_id: user_group_raw.creator_id,
        date_created: user_group_raw.date_created,
        members: new Set(user_group_raw.members),
        is_system_group: user_group_raw.is_system_group,
        direct_subgroup_ids: new Set(user_group_raw.direct_subgroup_ids),
        can_add_members_group: user_group_raw.can_add_members_group,
        can_join_group: user_group_raw.can_join_group,
        can_leave_group: user_group_raw.can_leave_group,
        can_manage_group: user_group_raw.can_manage_group,
        can_mention_group: user_group_raw.can_mention_group,
        deactivated: user_group_raw.deactivated,
    };

    user_group_name_dict.set(user_group.name, user_group);
    user_group_by_id_dict.set(user_group.id, user_group);
    return user_group;
}

export function remove(user_group: UserGroup): void {
    user_group_name_dict.delete(user_group.name);
    user_group_by_id_dict.delete(user_group.id);
}

export function get_user_group_from_id(group_id: number): UserGroup {
    const user_group = user_group_by_id_dict.get(group_id);
    if (!user_group) {
        throw new Error(`Unknown group_id in get_user_group_from_id: ${group_id}`);
    }
    return user_group;
}

export function maybe_get_user_group_from_id(group_id: number): UserGroup | undefined {
    return user_group_by_id_dict.get(group_id);
}

export function update(event: UserGroupUpdateEvent): void {
    const group = get_user_group_from_id(event.group_id);
    if (event.data.name !== undefined) {
        user_group_name_dict.delete(group.name);
        group.name = event.data.name;
        user_group_name_dict.set(group.name, group);
    }
    if (event.data.description !== undefined) {
        group.description = event.data.description;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }

    if (event.data.deactivated !== undefined) {
        group.deactivated = event.data.deactivated;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }

    if (event.data.can_add_members_group !== undefined) {
        group.can_add_members_group = event.data.can_add_members_group;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }

    if (event.data.can_mention_group !== undefined) {
        group.can_mention_group = event.data.can_mention_group;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }

    if (event.data.can_manage_group !== undefined) {
        group.can_manage_group = event.data.can_manage_group;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }

    if (event.data.can_join_group !== undefined) {
        group.can_join_group = event.data.can_join_group;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }

    if (event.data.can_leave_group !== undefined) {
        group.can_leave_group = event.data.can_leave_group;
        user_group_name_dict.delete(group.name);
        user_group_name_dict.set(group.name, group);
    }
}

export function get_user_group_from_name(name: string): UserGroup | undefined {
    return user_group_name_dict.get(name);
}

export function get_realm_user_groups(include_deactivated = false): UserGroup[] {
    const user_groups = [...user_group_by_id_dict.values()].sort((a, b) => a.id - b.id);
    return user_groups.filter((group) => {
        if (group.is_system_group) {
            return false;
        }

        if (!include_deactivated && group.deactivated) {
            return false;
        }

        return true;
    });
}

// This is only used for testing currently, but would be used in
// future when we use system groups more and probably show them
// in the UI as well.
export function get_all_realm_user_groups(): UserGroup[] {
    const user_groups = [...user_group_by_id_dict.values()].sort((a, b) => a.id - b.id);
    return user_groups;
}

export function get_user_groups_allowed_to_mention(): UserGroup[] {
    const user_groups = get_realm_user_groups();
    return user_groups.filter((group) => {
        const can_mention_group_id = group.can_mention_group;
        return is_user_in_setting_group(can_mention_group_id, current_user.user_id);
    });
}

export function is_direct_member_of(user_id: number, user_group_id: number): boolean {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return false;
    }
    return user_group.members.has(user_id);
}

export function add_members(user_group_id: number, user_ids: number[]): void {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return;
    }

    for (const user_id of user_ids) {
        user_group.members.add(user_id);
    }
}

export function remove_members(user_group_id: number, user_ids: number[]): void {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return;
    }

    for (const user_id of user_ids) {
        user_group.members.delete(user_id);
    }
}

export function add_subgroups(user_group_id: number, subgroup_ids: number[]): void {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return;
    }

    for (const subgroup_id of subgroup_ids) {
        user_group.direct_subgroup_ids.add(subgroup_id);
    }
}

export function remove_subgroups(user_group_id: number, subgroup_ids: number[]): void {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return;
    }

    for (const subgroup_id of subgroup_ids) {
        user_group.direct_subgroup_ids.delete(subgroup_id);
    }
}

export function initialize(params: StateData["user_groups"]): void {
    for (const user_group of params.realm_user_groups) {
        add(user_group);
    }
}

export function is_user_group(
    item: (UserOrMention & {members: undefined}) | UserGroup,
): item is UserGroup {
    return item.members !== undefined;
}

export function is_empty_group(user_group_id: number): boolean {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return false;
    }
    if (user_group.members.size > 0) {
        return false;
    }

    // Check if all the recursive subgroups are empty.
    // Correctness of this algorithm relying on the ES6 Set
    // implementation having the property that a `for of` loop will
    // visit all items that are added to the set during the loop.
    const subgroup_ids = new Set(user_group.direct_subgroup_ids);
    for (const subgroup_id of subgroup_ids) {
        const subgroup = user_group_by_id_dict.get(subgroup_id);
        if (subgroup === undefined) {
            blueslip.error("Could not find subgroup", {subgroup_id});
            return false;
        }
        if (subgroup.members.size > 0) {
            return false;
        }
        for (const direct_subgroup_id of subgroup.direct_subgroup_ids) {
            subgroup_ids.add(direct_subgroup_id);
        }
    }
    return true;
}

export function get_user_groups_of_user(user_id: number): UserGroup[] {
    const user_groups_realm = get_realm_user_groups();
    const groups_of_user = user_groups_realm.filter((group) =>
        is_direct_member_of(user_id, group.id),
    );
    return groups_of_user;
}

export function get_recursive_subgroups(target_user_group: UserGroup): Set<number> | undefined {
    // Correctness of this algorithm relying on the ES6 Set
    // implementation having the property that a `for of` loop will
    // visit all items that are added to the set during the loop.
    const subgroup_ids = new Set(target_user_group.direct_subgroup_ids);
    for (const subgroup_id of subgroup_ids) {
        const subgroup = user_group_by_id_dict.get(subgroup_id);
        if (subgroup === undefined) {
            blueslip.error("Could not find subgroup", {subgroup_id});
            return undefined;
        }

        for (const direct_subgroup_id of subgroup.direct_subgroup_ids) {
            subgroup_ids.add(direct_subgroup_id);
        }
    }
    return subgroup_ids;
}

export function get_recursive_group_members(target_user_group: UserGroup): Set<number> {
    const members = new Set(target_user_group.members);
    const subgroup_ids = get_recursive_subgroups(target_user_group);

    if (subgroup_ids === undefined) {
        return members;
    }

    for (const subgroup_id of subgroup_ids) {
        const subgroup = user_group_by_id_dict.get(subgroup_id);
        assert(subgroup !== undefined);
        for (const member of subgroup.members) {
            members.add(member);
        }
    }
    return members;
}

export function check_group_can_be_subgroup(
    subgroup: UserGroup,
    target_user_group: UserGroup,
): boolean {
    // This logic could be optimized if we maintained a reverse map
    // from each group to the groups containing it, which might be a
    // useful data structure for other code paths as well.
    if (subgroup.deactivated) {
        return false;
    }

    const already_subgroup_ids = target_user_group.direct_subgroup_ids;
    if (subgroup.id === target_user_group.id) {
        return false;
    }

    if (already_subgroup_ids.has(subgroup.id)) {
        return false;
    }

    const recursive_subgroup_ids = get_recursive_subgroups(subgroup);
    assert(recursive_subgroup_ids !== undefined);
    if (recursive_subgroup_ids.has(target_user_group.id)) {
        return false;
    }
    return true;
}

export function get_potential_subgroups(target_user_group_id: number): UserGroup[] {
    const target_user_group = get_user_group_from_id(target_user_group_id);
    return get_all_realm_user_groups().filter((user_group) =>
        check_group_can_be_subgroup(user_group, target_user_group),
    );
}

export function get_direct_subgroups_of_group(target_user_group: UserGroup): UserGroup[] {
    const direct_subgroups = [];
    const subgroup_ids = target_user_group.direct_subgroup_ids;
    for (const subgroup_id of subgroup_ids) {
        const subgroup = user_group_by_id_dict.get(subgroup_id);
        assert(subgroup !== undefined);
        direct_subgroups.push(subgroup);
    }
    return direct_subgroups;
}

export function is_user_in_group(
    user_group_id: number,
    user_id: number,
    direct_member_only = false,
): boolean {
    const user_group = user_group_by_id_dict.get(user_group_id);
    if (user_group === undefined) {
        blueslip.error("Could not find user group", {user_group_id});
        return false;
    }
    if (is_direct_member_of(user_id, user_group_id)) {
        return true;
    }

    if (direct_member_only) {
        return false;
    }

    const subgroup_ids = get_recursive_subgroups(user_group);
    if (subgroup_ids === undefined) {
        return false;
    }

    for (const group_id of subgroup_ids) {
        if (is_direct_member_of(user_id, group_id)) {
            return true;
        }
    }
    return false;
}

export function is_user_in_setting_group(
    setting_group: GroupSettingValue,
    user_id: number,
): boolean {
    if (typeof setting_group === "number") {
        return is_user_in_group(setting_group, user_id);
    }

    const direct_members = setting_group.direct_members;
    if (direct_members.includes(user_id)) {
        return true;
    }

    const direct_subgroups = setting_group.direct_subgroups;
    for (const direct_subgroup_id of direct_subgroups) {
        if (is_user_in_group(direct_subgroup_id, user_id)) {
            return true;
        }
    }
    return false;
}

function get_display_name_for_system_group_option(setting_name: string, name: string): string {
    // We use a special label for the "Nobody" system group for clarity.
    if (setting_name === "direct_message_permission_group" && name === "Nobody") {
        return $t({defaultMessage: "Direct messages disabled"});
    }
    return name;
}

export function check_system_user_group_allowed_for_setting(
    group_name: string,
    group_setting_config: GroupPermissionSetting,
    for_new_settings_ui: boolean,
): boolean {
    const {
        allow_internet_group,
        allow_owners_group,
        allow_nobody_group,
        allow_everyone_group,
        allowed_system_groups,
    } = group_setting_config;

    if (!allow_internet_group && group_name === "role:internet") {
        return false;
    }

    if (!allow_owners_group && group_name === "role:owners") {
        return false;
    }

    if ((!allow_nobody_group || for_new_settings_ui) && group_name === "role:nobody") {
        return false;
    }

    if (!allow_everyone_group && group_name === "role:everyone") {
        return false;
    }

    if (allowed_system_groups.length && !allowed_system_groups.includes(group_name)) {
        return false;
    }

    if (
        group_name === "role:fullmembers" &&
        for_new_settings_ui &&
        realm.realm_waiting_period_threshold === 0
    ) {
        // We hide the full members group in the typeahead when
        // there is no separation between member and full member
        // users due to organization not having set a waiting
        // period for member users to become full members.
        return false;
    }

    return true;
}

export function get_realm_user_groups_for_setting(
    setting_name: string,
    setting_type: "realm" | "stream" | "group",
    for_new_settings_ui = false,
): UserGroup[] {
    const group_setting_config = group_permission_settings.get_group_permission_setting_config(
        setting_name,
        setting_type,
    );

    if (group_setting_config === undefined) {
        return [];
    }

    const system_user_groups = settings_config.system_user_groups_list
        .filter((group) =>
            check_system_user_group_allowed_for_setting(
                group.name,
                group_setting_config,
                for_new_settings_ui,
            ),
        )
        .map((group) => {
            const user_group = get_user_group_from_name(group.name);
            if (!user_group) {
                throw new Error(`Unknown group name: ${group.name}`);
            }
            return user_group;
        });

    if (!page_params.development_environment || group_setting_config.require_system_group) {
        return system_user_groups;
    }

    const user_groups_excluding_system_groups = get_realm_user_groups();

    return [...system_user_groups, ...user_groups_excluding_system_groups];
}

export function get_realm_user_groups_for_dropdown_list_widget(
    setting_name: string,
    setting_type: "realm" | "stream" | "group",
): UserGroupForDropdownListWidget[] {
    const allowed_setting_groups = get_realm_user_groups_for_setting(setting_name, setting_type);

    return allowed_setting_groups.map((group) => {
        if (!group.is_system_group) {
            return {
                name: group.name,
                unique_id: group.id,
            };
        }

        const display_name = settings_config.system_user_groups_list.find(
            (system_group) => system_group.name === group.name,
        )!.dropdown_option_name;

        return {
            name: get_display_name_for_system_group_option(setting_name, display_name),
            unique_id: group.id,
        };
    });
}

export function get_display_group_name(group_name: string): string {
    const group = settings_config.system_user_groups_list.find(
        (system_group) => system_group.name === group_name,
    );

    if (group === undefined) {
        return group_name;
    }

    return group.display_name;
}
