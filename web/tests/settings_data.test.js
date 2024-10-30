"use strict";

const assert = require("node:assert/strict");

const {mock_esm, with_overrides, zrequire} = require("./lib/namespace");
const {run_test} = require("./lib/test");
const {page_params} = require("./lib/zpage_params");

const settings_data = zrequire("settings_data");
const settings_config = zrequire("settings_config");
const {set_current_user, set_realm} = zrequire("state_data");
const user_groups = zrequire("user_groups");
const {initialize_user_settings} = zrequire("user_settings");

const current_user = {};
set_current_user(current_user);
const realm = {};
set_realm(realm);
const user_settings = {};
initialize_user_settings({user_settings});

/*
    Some methods in settings_data are fairly
    trivial, so the meaningful tests happen
    at the higher layers, such as when we
    test people.js.
*/

const isaac = {
    email: "isaac@example.com",
    delivery_email: "isaac-delivery@example.com",
    user_id: 30,
    full_name: "Isaac",
};

const group_permission_settings = mock_esm("../src/group_permission_settings", {});

run_test("user_can_change_email", ({override}) => {
    const can_change_email = settings_data.user_can_change_email;

    override(current_user, "is_admin", true);
    assert.equal(can_change_email(), true);

    override(current_user, "is_admin", false);
    override(realm, "realm_email_changes_disabled", true);
    assert.equal(can_change_email(), false);

    override(realm, "realm_email_changes_disabled", false);
    assert.equal(can_change_email(), true);
});

run_test("user_can_change_name", ({override}) => {
    const can_change_name = settings_data.user_can_change_name;

    override(current_user, "is_admin", true);
    assert.equal(can_change_name(), true);

    override(current_user, "is_admin", false);
    override(realm, "realm_name_changes_disabled", true);
    override(realm, "server_name_changes_disabled", false);
    assert.equal(can_change_name(), false);

    override(realm, "realm_name_changes_disabled", false);
    override(realm, "server_name_changes_disabled", false);
    assert.equal(can_change_name(), true);

    override(realm, "realm_name_changes_disabled", false);
    override(realm, "server_name_changes_disabled", true);
    assert.equal(can_change_name(), false);
});

run_test("user_can_change_avatar", ({override}) => {
    const can_change_avatar = settings_data.user_can_change_avatar;

    override(current_user, "is_admin", true);
    assert.equal(can_change_avatar(), true);

    override(current_user, "is_admin", false);
    override(realm, "realm_avatar_changes_disabled", true);
    override(realm, "server_avatar_changes_disabled", false);
    assert.equal(can_change_avatar(), false);

    override(realm, "realm_avatar_changes_disabled", false);
    override(realm, "server_avatar_changes_disabled", false);
    assert.equal(can_change_avatar(), true);

    override(realm, "realm_avatar_changes_disabled", false);
    override(realm, "server_avatar_changes_disabled", true);
    assert.equal(can_change_avatar(), false);
});

run_test("user_can_change_logo", ({override}) => {
    const can_change_logo = settings_data.user_can_change_logo;

    override(current_user, "is_admin", true);
    override(realm, "zulip_plan_is_not_limited", true);
    assert.equal(can_change_logo(), true);

    override(current_user, "is_admin", false);
    override(realm, "zulip_plan_is_not_limited", false);
    assert.equal(can_change_logo(), false);

    override(current_user, "is_admin", true);
    override(realm, "zulip_plan_is_not_limited", false);
    assert.equal(can_change_logo(), false);

    override(current_user, "is_admin", false);
    override(realm, "zulip_plan_is_not_limited", true);
    assert.equal(can_change_logo(), false);
});

function test_policy(label, policy, validation_func) {
    run_test(label, ({override}) => {
        override(current_user, "is_admin", true);
        override(realm, policy, settings_config.common_policy_values.by_admins_only.code);
        assert.equal(validation_func(), true);

        override(current_user, "is_admin", false);
        assert.equal(validation_func(), false);

        override(current_user, "is_moderator", true);
        override(realm, policy, settings_config.common_policy_values.by_moderators_only.code);
        assert.equal(validation_func(), true);

        override(current_user, "is_moderator", false);
        assert.equal(validation_func(), false);

        override(current_user, "is_guest", true);
        override(realm, policy, settings_config.common_policy_values.by_members.code);
        assert.equal(validation_func(), false);

        override(current_user, "is_guest", false);
        assert.equal(validation_func(), true);

        page_params.is_spectator = true;
        override(realm, policy, settings_config.common_policy_values.by_members.code);
        assert.equal(validation_func(), false);

        page_params.is_spectator = false;
        assert.equal(validation_func(), true);

        override(realm, policy, settings_config.common_policy_values.by_full_members.code);
        override(current_user, "user_id", 30);
        isaac.date_joined = new Date(Date.now());
        settings_data.initialize(isaac.date_joined);
        override(realm, "realm_waiting_period_threshold", 10);
        assert.equal(validation_func(), false);

        isaac.date_joined = new Date(Date.now() - 20 * 86400000);
        settings_data.initialize(isaac.date_joined);
        assert.equal(validation_func(), true);
    });
}

test_policy(
    "user_can_subscribe_other_users",
    "realm_invite_to_stream_policy",
    settings_data.user_can_subscribe_other_users,
);
test_policy(
    "user_can_invite_others_to_realm",
    "realm_invite_to_realm_policy",
    settings_data.user_can_invite_users_by_email,
);

test_realm_group_settings(
    "realm_can_add_custom_emoji_group",
    settings_data.user_can_add_custom_emoji,
);

test_realm_group_settings(
    "realm_can_delete_any_message_group",
    settings_data.user_can_delete_any_message,
);

test_realm_group_settings(
    "realm_can_delete_own_message_group",
    settings_data.user_can_delete_own_message,
);

test_realm_group_settings(
    "realm_can_move_messages_between_channels_group",
    settings_data.user_can_move_messages_between_streams,
);

test_realm_group_settings(
    "realm_can_move_messages_between_topics_group",
    settings_data.user_can_move_messages_to_another_topic,
);

run_test("using_dark_theme", ({override}) => {
    override(user_settings, "color_scheme", settings_config.color_scheme_values.dark.code);
    assert.equal(settings_data.using_dark_theme(), true);

    override(user_settings, "color_scheme", settings_config.color_scheme_values.automatic.code);

    window.matchMedia = (query) => {
        assert.equal(query, "(prefers-color-scheme: dark)");
        return {matches: true};
    };
    assert.equal(settings_data.using_dark_theme(), true);

    window.matchMedia = (query) => {
        assert.equal(query, "(prefers-color-scheme: dark)");
        return {matches: false};
    };
    assert.equal(settings_data.using_dark_theme(), false);

    override(user_settings, "color_scheme", settings_config.color_scheme_values.light.code);
    assert.equal(settings_data.using_dark_theme(), false);
});

run_test("user_can_invite_others_to_realm_nobody_case", ({override}) => {
    override(current_user, "is_admin", true);
    override(current_user, "is_guest", false);
    override(
        realm,
        "realm_invite_to_realm_policy",
        settings_config.email_invite_to_realm_policy_values.nobody.code,
    );
    assert.equal(settings_data.user_can_invite_users_by_email(), false);
});

run_test("user_email_not_configured", ({override}) => {
    const user_email_not_configured = settings_data.user_email_not_configured;

    override(current_user, "is_owner", false);
    assert.equal(user_email_not_configured(), false);

    override(current_user, "is_owner", true);
    override(current_user, "delivery_email", "");
    assert.equal(user_email_not_configured(), true);

    override(current_user, "delivery_email", "name@example.com");
    assert.equal(user_email_not_configured(), false);
});

function test_realm_group_settings(setting_name, validation_func) {
    with_overrides(({override}) => {
        const admin_user_id = 1;
        const moderator_user_id = 2;
        const member_user_id = 3;

        const admins = {
            name: "Admins",
            id: 1,
            members: new Set([admin_user_id]),
            is_system_group: true,
            direct_subgroup_ids: new Set([]),
        };
        const moderators = {
            name: "Moderators",
            id: 2,
            members: new Set([moderator_user_id]),
            is_system_group: true,
            direct_subgroup_ids: new Set([1]),
        };

        group_permission_settings.get_group_permission_setting_config = () => ({
            allow_everyone_group: false,
        });

        user_groups.initialize({realm_user_groups: [admins, moderators]});
        page_params.is_spectator = true;
        assert.equal(validation_func(), false);

        page_params.is_spectator = false;
        override(current_user, "is_guest", false);
        override(realm, setting_name, 1);
        override(current_user, "user_id", admin_user_id);
        assert.equal(validation_func(), true);

        override(current_user, "user_id", moderator_user_id);
        assert.equal(validation_func(), false);

        override(realm, setting_name, 2);
        override(current_user, "user_id", moderator_user_id);
        assert.equal(validation_func(), true);

        override(current_user, "user_id", member_user_id);
        assert.equal(validation_func(), false);

        override(current_user, "user_id", moderator_user_id);
        override(current_user, "is_guest", true);
        assert.equal(validation_func(), false);

        group_permission_settings.get_group_permission_setting_config = () => ({
            allow_everyone_group: true,
        });
        assert.equal(validation_func(), true);
    });
}

run_test("user_can_create_multiuse_invite", () => {
    test_realm_group_settings(
        "realm_create_multiuse_invite_group",
        settings_data.user_can_create_multiuse_invite,
    );
});

run_test("can_manage_user_group", ({override}) => {
    const admins = {
        description: "Administrators",
        name: "role:administrators",
        id: 1,
        members: new Set([1]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const moderators = {
        description: "Moderators",
        name: "role:moderators",
        id: 2,
        members: new Set([2]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1]),
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const members = {
        description: "Members",
        name: "role:members",
        id: 3,
        members: new Set([3, 4]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1, 2]),
        can_manage_group: 4,
        can_mention_group: 4,
    };
    const nobody = {
        description: "Nobody",
        name: "role:nobody",
        id: 4,
        members: new Set([]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_manage_group: 4,
        can_mention_group: 2,
    };
    const students = {
        description: "Students group",
        name: "Students",
        id: 5,
        members: new Set([1, 2]),
        is_system_group: false,
        direct_subgroup_ids: new Set([4, 5]),
        can_manage_group: {
            direct_members: [4],
            direct_subgroups: [],
        },
        can_mention_group: 3,
        creator_id: 4,
    };
    user_groups.initialize({
        realm_user_groups: [admins, moderators, members, nobody, students],
    });

    page_params.is_spectator = true;
    assert.ok(!settings_data.can_manage_user_group(students.id));

    page_params.is_spectator = false;
    override(realm, "realm_can_manage_all_groups", admins.id);
    override(current_user, "user_id", 3);
    assert.ok(!settings_data.can_manage_user_group(students.id));

    // non-admin group_creator
    override(current_user, "user_id", 4);
    assert.ok(settings_data.can_manage_user_group(students.id));

    // admin user
    override(current_user, "user_id", 1);
    assert.ok(settings_data.can_manage_user_group(students.id));

    // moderator user
    override(current_user, "user_id", 2);
    assert.ok(!settings_data.can_manage_user_group(students.id));

    // User with role member and not part of the group.
    override(realm, "realm_can_manage_all_groups", members.id);
    override(current_user, "user_id", 3);
    assert.ok(settings_data.can_manage_user_group(students.id));

    // User with role member and part of the group.
    override(current_user, "user_id", 2);
    assert.ok(settings_data.can_manage_user_group(students.id));

    override(realm, "realm_can_manage_all_groups", admins.id);
    override(current_user, "user_id", 2);
    assert.ok(!settings_data.can_manage_user_group(students.id));

    const event = {
        group_id: students.id,
        data: {
            can_manage_group: members.id,
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_manage_user_group(students.id));

    override(current_user, "user_id", 3);
    assert.ok(settings_data.can_manage_user_group(students.id));
});

run_test("can_join_user_group", ({override}) => {
    const admins = {
        description: "Administrators",
        name: "role:administrators",
        id: 1,
        members: new Set([1]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_join_group: 4,
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const moderators = {
        description: "Moderators",
        name: "role:moderators",
        id: 2,
        members: new Set([2]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1]),
        can_join_group: 4,
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const members = {
        description: "Members",
        name: "role:members",
        id: 3,
        members: new Set([3, 4]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1, 2]),
        can_join_group: 4,
        can_manage_group: 4,
        can_mention_group: 4,
    };
    const nobody = {
        description: "Nobody",
        name: "role:nobody",
        id: 4,
        members: new Set([]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_join_group: 4,
        can_manage_group: 4,
        can_mention_group: 2,
    };
    const students = {
        description: "Students group",
        name: "Students",
        id: 5,
        members: new Set([1, 2]),
        is_system_group: false,
        direct_subgroup_ids: new Set([4, 5]),
        can_join_group: 1,
        can_manage_group: {
            direct_members: [4],
            direct_subgroups: [],
        },
        can_mention_group: 3,
        creator_id: 4,
    };
    user_groups.initialize({
        realm_user_groups: [admins, moderators, members, nobody, students],
    });
    override(realm, "realm_can_manage_all_groups", nobody.id);

    page_params.is_spectator = true;
    assert.ok(!settings_data.can_join_user_group(students.id));

    page_params.is_spectator = false;
    // admin user
    override(current_user, "user_id", 1);
    assert.ok(settings_data.can_join_user_group(students.id));

    // moderator user
    override(current_user, "user_id", 2);
    assert.ok(!settings_data.can_join_user_group(students.id));

    let event = {
        group_id: students.id,
        data: {
            can_join_group: moderators.id,
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_join_user_group(students.id));

    override(current_user, "user_id", 1);
    assert.ok(settings_data.can_join_user_group(students.id));

    // Some other user.
    override(current_user, "user_id", 5);
    assert.ok(!settings_data.can_join_user_group(students.id));

    event = {
        group_id: students.id,
        data: {
            can_join_group: {
                direct_members: [5],
                direct_subgroups: [admins.id],
            },
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_join_user_group(students.id));

    override(current_user, "user_id", 2);
    assert.ok(!settings_data.can_join_user_group(students.id));

    // User can join the group if they can add anyone in the group which
    // depends on can_manage_group and realm.can_manage_all_groups settings.
    override(current_user, "user_id", 4);
    assert.ok(settings_data.can_join_user_group(students.id));

    override(realm, "realm_can_manage_all_groups", moderators.id);
    override(current_user, "user_id", 2);
    assert.ok(settings_data.can_join_user_group(students.id));
});

run_test("can_leave_user_group", ({override}) => {
    const admins = {
        description: "Administrators",
        name: "role:administrators",
        id: 1,
        members: new Set([1]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_join_group: 4,
        can_leave_group: 4,
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const moderators = {
        description: "Moderators",
        name: "role:moderators",
        id: 2,
        members: new Set([2]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1]),
        can_join_group: 4,
        can_leave_group: 4,
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const members = {
        description: "Members",
        name: "role:members",
        id: 3,
        members: new Set([3, 4]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1, 2]),
        can_join_group: 4,
        can_leave_group: 4,
        can_manage_group: 4,
        can_mention_group: 4,
    };
    const nobody = {
        description: "Nobody",
        name: "role:nobody",
        id: 4,
        members: new Set([]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_join_group: 4,
        can_leave_group: 4,
        can_manage_group: 4,
        can_mention_group: 2,
    };
    const students = {
        description: "Students group",
        name: "Students",
        id: 5,
        members: new Set([1, 2]),
        is_system_group: false,
        direct_subgroup_ids: new Set([4, 5]),
        can_join_group: 1,
        can_leave_group: 1,
        can_manage_group: {
            direct_members: [4],
            direct_subgroups: [],
        },
        can_mention_group: 3,
        creator_id: 4,
    };
    user_groups.initialize({
        realm_user_groups: [admins, moderators, members, nobody, students],
    });
    override(realm, "realm_can_manage_all_groups", nobody.id);

    page_params.is_spectator = true;
    assert.ok(!settings_data.can_leave_user_group(students.id));

    page_params.is_spectator = false;
    // admin user
    override(current_user, "user_id", 1);
    assert.ok(settings_data.can_leave_user_group(students.id));

    // moderator user
    override(current_user, "user_id", 2);
    assert.ok(!settings_data.can_leave_user_group(students.id));

    let event = {
        group_id: students.id,
        data: {
            can_leave_group: moderators.id,
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_leave_user_group(students.id));

    override(current_user, "user_id", 1);
    assert.ok(settings_data.can_leave_user_group(students.id));

    // Some other user.
    override(current_user, "user_id", 5);
    assert.ok(!settings_data.can_leave_user_group(students.id));

    event = {
        group_id: students.id,
        data: {
            can_leave_group: {
                direct_members: [5],
                direct_subgroups: [admins.id],
            },
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_leave_user_group(students.id));

    override(current_user, "user_id", 2);
    assert.ok(!settings_data.can_leave_user_group(students.id));

    // User can leave the group if they can manage the group which
    // depends on can_manage_group and realm.can_manage_all_groups settings.
    override(current_user, "user_id", 4);
    assert.ok(settings_data.can_leave_user_group(students.id));

    override(realm, "realm_can_manage_all_groups", moderators.id);
    override(current_user, "user_id", 2);
    assert.ok(settings_data.can_leave_user_group(students.id));
});

run_test("can_add_members_user_group", () => {
    const admins = {
        description: "Administrators",
        name: "role:administrators",
        id: 1,
        members: new Set([1]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_add_members_group: 4,
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const moderators = {
        description: "Moderators",
        name: "role:moderators",
        id: 2,
        members: new Set([2]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1]),
        can_add_members_group: 4,
        can_manage_group: 4,
        can_mention_group: 1,
    };
    const members = {
        description: "Members",
        name: "role:members",
        id: 3,
        members: new Set([3, 4]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1, 2]),
        can_add_members_group: 4,
        can_manage_group: 4,
        can_mention_group: 4,
    };
    const nobody = {
        description: "Nobody",
        name: "role:nobody",
        id: 4,
        members: new Set([]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
        can_add_members_group: 4,
        can_manage_group: 4,
        can_mention_group: 2,
    };
    const students = {
        description: "Students group",
        name: "Students",
        id: 5,
        members: new Set([1, 2]),
        is_system_group: false,
        direct_subgroup_ids: new Set([4, 5]),
        can_add_members_group: 1,
        can_manage_group: {
            direct_members: [6],
            direct_subgroups: [],
        },
        can_mention_group: 3,
        creator_id: 4,
    };
    user_groups.initialize({
        realm_user_groups: [admins, moderators, members, nobody, students],
    });
    realm.realm_can_manage_all_groups = nobody.id;

    page_params.is_spectator = true;
    assert.ok(!settings_data.can_add_members_to_user_group(students.id));

    page_params.is_spectator = false;
    // admin user
    current_user.user_id = 1;
    assert.ok(settings_data.can_add_members_to_user_group(students.id));

    // moderator user
    current_user.user_id = 2;
    assert.ok(!settings_data.can_add_members_to_user_group(students.id));

    let event = {
        group_id: students.id,
        data: {
            can_add_members_group: moderators.id,
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_add_members_to_user_group(students.id));

    // Some other user.
    current_user.user_id = 5;
    assert.ok(!settings_data.can_add_members_to_user_group(students.id));

    event = {
        group_id: students.id,
        data: {
            can_add_members_group: {
                direct_members: [5],
                direct_subgroups: [admins.id],
            },
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_add_members_to_user_group(students.id));

    // Users with permission to manage the group should be able to add
    // members to the group without adding themselves to
    // can_add_members_group.
    current_user.user_id = 4;
    assert.ok(!settings_data.can_add_members_to_user_group(students.id));
    event = {
        group_id: students.id,
        data: {
            can_manage_group: {
                direct_members: [4],
            },
        },
    };
    user_groups.update(event);
    assert.ok(settings_data.can_add_members_to_user_group(students.id));
});

run_test("type_id_to_string", () => {
    page_params.bot_types = [
        {
            type_id: 1,
            name: "Generic bot",
            allowed: true,
        },
        {
            type_id: 2,
            name: "Incoming webhook",
            allowed: true,
        },
    ];

    assert.equal(settings_data.bot_type_id_to_string(1), "Generic bot");
    assert.equal(settings_data.bot_type_id_to_string(2), "Incoming webhook");
    assert.equal(settings_data.bot_type_id_to_string(5), undefined);
});

run_test("user_can_access_all_other_users", ({override}) => {
    const guest_user_id = 1;
    const member_user_id = 2;

    const members = {
        name: "role:members",
        id: 1,
        members: new Set([member_user_id]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
    };
    const everyone = {
        name: "role:everyone",
        id: 2,
        members: new Set([guest_user_id]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1]),
    };

    user_groups.initialize({realm_user_groups: [members, everyone]});
    override(realm, "realm_can_access_all_users_group", members.id);

    // Test spectators case.
    page_params.is_spectator = true;
    assert.ok(settings_data.user_can_access_all_other_users());

    page_params.is_spectator = false;
    override(current_user, "user_id", member_user_id);
    assert.ok(settings_data.user_can_access_all_other_users());

    override(current_user, "user_id", guest_user_id);
    assert.ok(!settings_data.user_can_access_all_other_users());

    override(realm, "realm_can_access_all_users_group", everyone.id);
    assert.ok(settings_data.user_can_access_all_other_users());
});

run_test("user_can_create_public_streams", () => {
    test_realm_group_settings(
        "realm_can_create_public_channel_group",
        settings_data.user_can_create_public_streams,
    );
});

run_test("user_can_create_user_groups", () => {
    test_realm_group_settings("realm_can_create_groups", settings_data.user_can_create_user_groups);
});

run_test("user_can_manage_all_groups", () => {
    test_realm_group_settings(
        "realm_can_manage_all_groups",
        settings_data.user_can_manage_all_groups,
    );
});

run_test("user_can_create_private_streams", () => {
    test_realm_group_settings(
        "realm_can_create_private_channel_group",
        settings_data.user_can_create_private_streams,
    );
});

run_test("user_can_create_web_public_streams", ({override}) => {
    override(realm, "server_web_public_streams_enabled", true);
    override(realm, "realm_enable_spectator_access", true);

    test_realm_group_settings(
        "realm_can_create_web_public_channel_group",
        settings_data.user_can_create_web_public_streams,
    );
    const owner_user_id = 4;
    const owners = {
        name: "Admins",
        id: 3,
        members: new Set([owner_user_id]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
    };
    override(current_user, "user_id", owner_user_id);
    user_groups.initialize({realm_user_groups: [owners]});

    override(realm, "server_web_public_streams_enabled", true);
    override(realm, "realm_enable_spectator_access", true);
    override(realm, "realm_can_create_web_public_channel_group", owners.id);
    assert.equal(settings_data.user_can_create_web_public_streams(), true);

    override(realm, "realm_enable_spectator_access", false);
    override(realm, "server_web_public_streams_enabled", true);
    assert.equal(settings_data.user_can_create_web_public_streams(), false);

    override(realm, "realm_enable_spectator_access", true);
    override(realm, "server_web_public_streams_enabled", false);
    assert.equal(settings_data.user_can_create_web_public_streams(), false);

    override(realm, "realm_enable_spectator_access", false);
    override(realm, "server_web_public_streams_enabled", false);
    assert.equal(settings_data.user_can_create_web_public_streams(), false);
});

run_test("guests_can_access_all_other_users", () => {
    const guest_user_id = 1;
    const member_user_id = 2;

    const members = {
        name: "role:members",
        id: 1,
        members: new Set([member_user_id]),
        is_system_group: true,
        direct_subgroup_ids: new Set([]),
    };
    const everyone = {
        name: "role:everyone",
        id: 2,
        members: new Set([guest_user_id]),
        is_system_group: true,
        direct_subgroup_ids: new Set([1]),
    };

    user_groups.initialize({realm_user_groups: [members]});
    realm.realm_can_access_all_users_group = members.id;
    assert.ok(!settings_data.guests_can_access_all_other_users());

    user_groups.initialize({realm_user_groups: [members, everyone]});
    realm.realm_can_access_all_users_group = everyone.id;
    assert.ok(settings_data.guests_can_access_all_other_users());
});
