/* Signals: */

function _repl() {
    add_all_from_workspace()

    meta_window = global.display.focus_window;
    workspace = meta_window.get_workspace();
    window_actor = meta_window.get_compositor_private();

    set_action_handler("toggle-scratch-layer", () => { print("It works!"); });

    meta_window = pages[0]
//: [object instance proxy GType:MetaWindowX11 jsobj@0x7f8c39e52f70 native@0x3d43880]
    workspace = meta_window.get_workspace()
//: [object instance proxy GIName:Meta.Workspace jsobj@0x7f8c47166790 native@0x23b5360]

    actor = meta_window.get_compositor_private()

    St = imports.gi.St;
    St.set_slow_down_factor(1);
    St.set_slow_down_factor(3);

    actor.z_position

    meta = imports.gi.Meta
    meta_window.get_layer()

    // Use to control the stack level
    meta_window.raise()
    meta_window.lower()

    let length = 0
    pages.map((meta_window) => {
        let width = meta_window.get_frame_rect().width
        meta_window.move_resize_frame(true, length, 25, width, global.screen_height - 30)
        length += width + overlap
    })
}

debug_all = true;
debug_filter = {};
debug = () => {
    if (!debug_all) {
        let keyword = arguments[0];
        if (!debug_filter[keyword])
            return;
    }
    print(Array.prototype.join.call(arguments, " | "));
}


workspaces = []
for (let i=0; i < global.screen.n_workspaces; i++) {
    workspaces[i] = []
}
focus = () => {
    let meta_window = global.display.focus_window;
    if (!meta_window)
        return -1;
    return workspaces[meta_window.get_workspace().workspace_index].indexOf(meta_window)
}

window_gap = 10
margin_lr = 20
statusbar = undefined
global.stage.get_first_child().get_children().forEach((actor) => {
    if ("panelBox" == actor.name) {
        statusbar = actor
    }
})
statusbar_height = statusbar.height
margin_tb = 2
overlap = 10
glib = imports.gi.GLib

Tweener = imports.ui.tweener;
margin = 75

// Max height for windows
max_height = global.screen_height - statusbar_height - margin_tb*2;
// Height to use when scaled down at the sides
scaled_height = max_height*0.95;
scaled_y_offset = (max_height - scaled_height)/2;
move = (meta_window, x, y, onComplete, onStart, delay) => {
    let actor = meta_window.get_compositor_private()
    let buffer = actor.meta_window.get_buffer_rect();
    let frame = actor.meta_window.get_frame_rect();
    x = Math.min(global.screen_width - margin, x)
    x = Math.max(margin - frame.width, x)
    let x_offset = frame.x - buffer.x;
    let y_offset = frame.y - buffer.y;
    let scale = 1;
    delay = delay || 0;
    if (x >= global.screen_width - margin || x <= margin - frame.width) {
        // Set scale so that the scaled height will be `scaled_height`
        scale = scaled_height/frame.height;
        // Center the actor properly
        y += scaled_y_offset;
        let pivot = actor.pivot_point;
        actor.set_pivot_point(pivot.x, y_offset/buffer.height);
    }
    Tweener.addTween(actor, {x: x - x_offset
                             , y: y - y_offset
                             , time: 0.25 - delay
                             , delay: delay
                             , scale_x: scale
                             , scale_y: scale
                             , transition: "easeInOutQuad"
                             , onStart: () => {
                                 onStart && onStart();
                             }
                             , onComplete: () => {
                                 actor.meta_window.move_frame(true, x, y);
                                 onComplete && onComplete();
                             }})

}

timestamp = () => {
    return glib.get_monotonic_time()/1000
}

ensuring = false;
ensure_viewport = (meta_window, force) => {
    if (ensuring == meta_window && !force) {
        debug('already ensuring', meta_window.title);
        return;
    }
    debug('Ensuring', meta_window.title);

    let workspace = workspaces[meta_window.get_workspace().workspace_index];
    let index = workspace.indexOf(meta_window)
    function move_to(meta_window, x, y, delay) {
        ensuring = meta_window;
        move(meta_window, x, y
             , () => { ensuring = false; }
             , () => { meta_window.raise(); }
             , delay
            );
        propogate_forward(workspace, index + 1, x + frame.width + window_gap, false);
        propogate_backward(workspace, index - 1, x - window_gap, false);
    }

    let frame = meta_window.get_frame_rect();
    // Share the available margin evenly between left and right
    // if the window is wide (should probably use a quotient larger than 2)
    let margin = margin_lr
    if (frame.width > global.screen_width - 2 * margin_lr)
        margin = (global.screen_width - frame.width)/2;

    // Hack to ensure the statusbar is visible while there's a fullscreen
    // windows in the workspace. TODO fade in/out in some way.
    if (!statusbar.visible) {
        statusbar.visible = true;
    }

    let x = frame.x;
    let y = statusbar_height + margin_tb;
    if (meta_window.fullscreen) {
        // Fullscreen takes highest priority
        x = 0, y = 0;
        statusbar.visible = false;
    } else if (index == 0) {
        // Always align the first window to the display's left edge
        x = 0;
    } else if (index == workspace.length-1) {
        // Always align the first window to the display's right edge
        x = global.screen_width - frame.width;
    } else if (frame.x + frame.width >= global.screen_width - margin) {
        // Align to the right margin
        x = global.screen_width - margin - frame.width;
    } else if (frame.x <= margin) {
        // Align to the left margin
        x = margin;
    }
    // Add a delay for stacked window to avoid windows passing
    // through each other in the z direction
    let delay = meta_window.get_compositor_private().is_scaled() ? 0.03 : 0;
    move_to(meta_window, x, y, delay);
}

framestr = (rect) => {
    return "[ x:"+rect.x + ", y:" + rect.y + " w:" + rect.width + " h:"+rect.height + " ]";
}

focus_handler = (meta_window, user_data) => {
    debug("focus:", meta_window.title, framestr(meta_window.get_frame_rect()));

    if(meta_window.scrollwm_initial_position) {
        debug("setting initial position", meta_window.scrollwm_initial_position)
        if (meta_window.get_maximized() == Meta.MaximizeFlags.BOTH) {
            meta_window.unmaximize(Meta.MaximizeFlags.BOTH);
            toggle_maximize_horizontally(meta_window);
            return;
        }
        let frame = meta_window.get_frame_rect();
        meta_window.move_resize_frame(true, meta_window.scrollwm_initial_position.x, meta_window.scrollwm_initial_position.y, frame.width, frame.height)
        ensure_viewport(meta_window);
        delete meta_window.scrollwm_initial_position;
    } else {
        ensure_viewport(meta_window)
    }
}

// Place window's left edge at x
propogate_forward = (workspace, n, x, lower) => {
    if (n < 0 || n >= workspace.length)
        return
    // print("positioning " + n)
    let meta_window = workspace[n]
    if (lower)
        meta_window.lower()
    // Anchor scaling/animation on the left edge for windows positioned to the right,
    meta_window.get_compositor_private().set_pivot_point(0, 0);
    move(meta_window, x, statusbar_height + margin_tb)
    propogate_forward(workspace, n+1, x+meta_window.get_frame_rect().width + overlap, true)
}
// Place window's right edge at x
propogate_backward = (workspace, n, x, lower) => {
    if (n < 0 || n >= workspace.length)
        return
    // print("positioning " + n)
    let meta_window = workspace[n]
    x = x - meta_window.get_frame_rect().width
    // Anchor on the right edge for windows positioned to the left.
    meta_window.get_compositor_private().set_pivot_point(1, 0);
    if (lower)
        meta_window.lower()
    move(meta_window, x, statusbar_height + margin_tb)
    propogate_backward(workspace, n-1, x - overlap, true)
}

center = (meta_window, zen) => {
    let frame = meta_window.get_frame_rect();
    let x = Math.floor((global.screen_width - frame.width)/2)
    move(meta_window, x, frame.y)
    let right = zen ? global.screen_width : x + frame.width + window_gap;
    let left = zen ? -global.screen_width : x - window_gap;
    let i = workspaces[meta_window.get_workspace().workspace_index].indexOf(meta_window);
    propogate_forward(i + 1, right);
    propogate_backward(i - 1, left);
}
focus_wrapper = (meta_window, user_data) => {
    focus_handler(meta_window, user_data)
}

add_filter = (meta_window) => {
    if (meta_window.window_type != Meta.WindowType.NORMAL) {
        return false;
    }
    return true;
}

/**
  Modelled after notion/ion3's system

  Examples:

    defwinprop({
        wm_class: "Emacs",
        float: true
    })
*/
winprops = [];

winprop_match_p = (meta_window, prop) => {
    let wm_class = meta_window.wm_class || "";
    let title = meta_window.title;
    if (prop.wm_class !== wm_class) {
        return false;
    }
    if (prop.title) {
        if (prop.title.constructor === RegExp) {
            if (!title.match(prop.title))
                return false;
        } else {
            if (prop.title !== title)
                return false;
        }
    }

    return true;
}

find_winprop = (meta_window) =>  {
    let props = winprops.filter(
        winprop_match_p.bind(null, meta_window));

    return props[0];
}

defwinprop = (spec) => {
    winprops.push(spec);
}

defwinprop({
    wm_class: "copyq",
    float: true
})

add_handler = (ws, meta_window) => {
    debug("window-added", meta_window, meta_window.title, meta_window.window_type);
    if (!add_filter(meta_window)) {
        return;
    }

    let winprop = find_winprop(meta_window);
    if (winprop) {
        if(winprop.oneshot) {
            // untested :)
            winprops.splice(winprops.indexOf(winprop), 1);
        }
        if(winprop.float) {
            // Let gnome-shell handle the placement
            return;
        }
    }

    let focus_i = focus();

    // Should inspert at index 0 if focus() returns -1
    let workspace = workspaces[ws.workspace_index]
    workspace.splice(focus_i + 1, 0, meta_window)

    if (focus_i == -1) {
        meta_window.scrollwm_initial_position = {x: 0, y:statusbar_height + margin_tb};
    } else {
        let frame = workspace[focus_i].get_frame_rect()
        meta_window.scrollwm_initial_position = {x:frame.x + frame.width + overlap, y:statusbar_height + margin_tb};

    }
    // Maxmize height. Setting position here doesn't work... 
    meta_window.move_resize_frame(true, 0, 0,
                                  meta_window.get_frame_rect().width, global.screen_height - statusbar_height - margin_tb*2);
    meta_window.connect("focus", focus_wrapper)
}

remove_handler = (ws, meta_window) => {
    debug("window-removed", meta_window, meta_window.title);
    // Note: If `meta_window` was closed and had focus at the time, the next
    // window has already received the `focus` signal at this point.

    let workspace = workspaces[meta_window.get_workspace().workspace_index]
    let removed_i = workspace.indexOf(meta_window)
    if (removed_i < 0)
        return
    workspace.splice(removed_i, 1)

    // Remove our signal handlers: Needed for non-closed windows.
    // (closing a window seems to clean out it's signal handlers)
    meta_window.disconnect(focus_wrapper);

    // Re-layout: Needed if the removed window didn't have focus.
    // Not sure if we can check if that was the case or not?
    workspace[Math.max(0, removed_i - 1)].activate(timestamp());
    // Force a new ensure, since the focus_handler is run before window-removed
    ensure_viewport(workspace[focus()], true)
}

add_all_from_workspace = (workspace) => {
    workspace = workspace || global.screen.get_active_workspace();
    let windows = workspace.list_windows();

    // On gnome-shell-restarts the windows are moved into the viewport, but
    // they're moved minimally and the stacking is not changed, so the tiling
    // order is preserved (sans full-width windows..)
    function xz_comparator(windows) {
        // Seems to be the only documented way to get stacking order?
        // Could also rely on the MetaWindowActor's index in it's parent
        // children array: That seem to correspond to clutters z-index (note:
        // z_position is something else)
        let z_sorted = global.display.sort_windows_by_stacking(windows);
        function xkey(mw) {
            let frame = mw.get_frame_rect();
            if(frame.x <= 0)
                return 0;
            if(frame.x+frame.width == global.screen_width) {
                return global.screen_width;
            }
            return frame.x;
        }
        // xorder: a|b c|d
        // zorder: a d b c
        return (a,b) => {
            let ax = xkey(a);
            let bx = xkey(b);
            // Yes, this is not efficient
            let az = z_sorted.indexOf(a);
            let bz = z_sorted.indexOf(b);
            let xcmp = ax - bx;
            if (xcmp !== 0)
                return xcmp;

            if (ax === 0) {
                // Left side: lower stacking first
                return az - bz;
            } else {
                // Right side: higher stacking first
                return bz - az;
            }
        };
    }

    windows.sort(xz_comparator(windows));

    let tiling = workspaces[workspace.workspace_index]
    windows.forEach((meta_window, i) => {
        if(tiling.indexOf(meta_window) < 0 && add_filter(meta_window)) {
            // Using add_handler is unreliable since it interacts with focus.
            tiling.push(meta_window);
            meta_window.connect("focus", focus_wrapper)
        }
    })
}

/**
 * Look up the function by name at call time. This makes it convenient to
 * redefine the function without re-registering all signal handler, keybindings,
 * etc. (this is like a function symbol in lisp)
 */
dynamic_function_ref = (handler_name, owner_obj) => {
    owner_obj = owner_obj || window;
    return function() {
        owner_obj[handler_name].apply(owner_obj, arguments);
    }
}

/**
 * Adapts a function operating on a meta_window to a key handler
 */
as_key_handler = function(fn) {
    if(typeof(fn) === "string") {
        fn = dynamic_function_ref(fn);
    }
    return function(screen, monitor, meta_window, binding) {
        return fn(meta_window);
    }
}

first_frame = (meta_window_actor) => {
    meta_window_actor.disconnect('first_frame');
    let meta_window = meta_window_actor.meta_window;
    debug("first frame: setting initial position", meta_window)
    if(meta_window.scrollwm_initial_position) {
        debug("setting initial position", meta_window.scrollwm_initial_position)
        if (meta_window.get_maximized() == Meta.MaximizeFlags.BOTH) {
            meta_window.unmaximize(Meta.MaximizeFlags.BOTH);
            toggle_maximize_horizontally(meta_window);
            return;
        }
        let frame = meta_window.get_frame_rect();
        meta_window.move_resize_frame(true, meta_window.scrollwm_initial_position.x, meta_window.scrollwm_initial_position.y, frame.width, frame.height)

        let workspace = workspaces[meta_window.get_workspace().workspace_index];
        propogate_forward(workspace, workspace.indexOf(meta_window) + 1, meta_window.scrollwm_initial_position.x + frame.width + window_gap);

        delete meta_window.scrollwm_initial_position;
    }
}

window_created = (display, meta_window, user_data) => {
    debug('window-created', meta_window.title);
    let actor = meta_window.get_compositor_private();
    actor.connect('first-frame', dynamic_function_ref('first_frame'));
}

global.display.connect('window-created', dynamic_function_ref('window_created'));

workspace_added = (screen, index) => {
    workspaces[index] = [];
    let workspace = global.screen.get_workspace_by_index(index);
    workspace.connect("window-added", dynamic_function_ref("add_handler"))
    workspace.connect("window-removed", dynamic_function_ref("remove_handler"));
    debug('workspace-added', index, workspace);

}
// Doesn't seem to trigger for some reason
workspace_removed = (screen, arg1, arg2) => {
    debug('workspace-removed');
    let workspace = global.screen.get_workspace_by_index(index);
}

global.screen.connect("workspace-added", dynamic_function_ref('workspace_added'))
global.screen.connect("workspace-removed", dynamic_function_ref('workspace_removed'));

recover_all_tilings = function() {
    for (let i=0; i < global.screen.n_workspaces; i++) {
        let workspace = global.screen.get_workspace_by_index(i)
        print("workspace: " + workspace)
        workspace.connect("window-added", dynamic_function_ref("add_handler"))
        workspace.connect("window-removed", dynamic_function_ref("remove_handler"));
        add_all_from_workspace(workspace);
    }
}
recover_all_tilings();

next = () => {
    let meta_window = global.display.focus_window
    workspaces[meta_window.get_workspace().workspace_index][focus()+1].activate(timestamp)
}
previous = () => {
    let meta_window = global.display.focus_window
    workspaces[meta_window.get_workspace().workspace_index][focus()-1].activate(timestamp)
}

util = {
    swap: function(array, i, j) {
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    },
    in_bounds: function(array, i) {
        return i >= 0 && i < array.length;
    }
};

move_helper = (meta_window, delta) => {
    // NB: delta should be 1 or -1
    let ws = workspaces[meta_window.get_workspace().workspace_index]
    let i = ws.indexOf(meta_window)
    if(util.in_bounds(ws, i+delta)) {
        util.swap(ws, i, i+delta);
        ensure_viewport(meta_window, true);
    }
}
move_right = () => {
    move_helper(global.display.focus_window, 1);
}
move_left = () => {
    move_helper(global.display.focus_window, -1);
}

toggle_maximize_horizontally = (meta_window) => {
    meta_window = meta_window || global.display.focus_window;

    // TODO: make some sort of animation
    // Note: should investigate best-practice for attaching extension-data to meta_windows
    if(meta_window.unmaximized_rect) {
        let unmaximized_rect = meta_window.unmaximized_rect;
        meta_window.move_resize_frame(true,
                                      unmaximized_rect.x, unmaximized_rect.y,
                                      unmaximized_rect.width, unmaximized_rect.height)
        meta_window.unmaximized_rect = undefined;
    } else {
        let frame = meta_window.get_frame_rect();
        meta_window.unmaximized_rect = frame;
        meta_window.move_resize_frame(true, frame.x, frame.y, global.screen_width - margin_lr*2, frame.height);
    }
    ensure_viewport(meta_window);
}

altTab = imports.ui.altTab;

PreviewedWindowNavigator = new Lang.Class({
    Name: 'PreviewedWindowNavigator',
    Extends: altTab.WindowSwitcherPopup,

    _init : function() {
        this.parent();
        this._selectedIndex = focus();
        debug('#preview', 'Init', this._switcherList.windows[this._selectedIndex].title, this._selectedIndex);
    },

    _initialSelection: function(backward, binding) {
        if (backward)
            this._select(Math.min(this._selectedIndex, this._previous()));
        else if (this._items.length == 1)
            this._select(0);
        else
            this._select(Math.max(this._selectedIndex, this._next()));
    },

    _getWindowList: function() {
        return workspaces[global.display.focus_window.get_workspace().workspace_index];
    },

    _select: function(index) {
        debug('#preview', 'Select', this._switcherList.windows[index].title, index);
        ensure_viewport(this._switcherList.windows[index]);
        this.parent(index);
    },

    _finish: function(timestamp) {
        this.was_accepted = true;
        this.parent(timestamp);
    },

    _onDestroy: function() {
        // this._selectedIndex is gone here, which might be the problem
        debug('#preview', 'onDestroy', this._selecetedIndex)
        if(!this.was_accepted && this._selectedIndex != focus()) {
            debug('#preview', 'Abort', global.display.focus_window.title);
            ensure_viewport(global.display.focus_window, true);
        }
        this.parent();
    }
});

LiveWindowNavigator = new Lang.Class({
    Name: 'LiveWindowNavigator',
    Extends: altTab.WindowCyclerPopup,

    _init : function() {
        this.parent();
        this._selectedIndex = focus();
    },

    _next: function() {
        return Math.min(this._items.length-1, this._selectedIndex+1)
    },
    _previous: function() {
        return Math.max(0, this._selectedIndex-1)
    },

    _initialSelection: function(backward, binding) {
        if (backward)
            this._select(this._previous());
        else if (this._items.length == 1)
            this._select(0);
        else
            this._select(this._next());
    },

    _highlightItem: function(index, justOutline) {
        ensure_viewport(this._items[index])
        this._highlight.window = this._items[index];
        global.window_group.set_child_above_sibling(this._highlight.actor, null);
    },

    _getWindows: function() {
        return workspaces[global.display.focus_window.get_workspace().workspace_index];
    }
});

/**
 * Navigate the tiling linearly with live preview, but delaying actual focus
 * change until modifier is released.
 */
live_navigate = (display, screen, meta_window, binding) => {
    // Note: the reverse binding only work as indented if the action bound to
    // this function is supported in the base class of LiveWindowNavigator.
    // See altTab.js and search for _keyPressHandler
    let tabPopup = new LiveWindowNavigator();
    tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask())
}

preview_navigate = (display, screen, meta_window, binding) => {
    let tabPopup = new PreviewedWindowNavigator();
    tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask())
}

// See gnome-shell-extensions-negesti/convenience.js for how to do this when we
// pack this as an actual extension
get_settings = function(schema) {
    const GioSSS = Gio.SettingsSchemaSource;

    schema = schema || "org.gnome.shell.extensions.org-scrollwm";

    // Need to create a proper extension soon..
    let schemaDir = GLib.getenv("HOME")+"/src/gnome-shell-minimap/schemas";
    // let schemaDir = GLib.getenv("HOME")+"/YOUR_PATH_HERE;
    let schemaSource;
    schemaSource = GioSSS.new_from_directory(schemaDir, GioSSS.get_default(), false);

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension ');

    return new Gio.Settings({ settings_schema: schemaObj });
}

set_action_handler = function(action_name, handler) {
    // Ripped from https://github.com/negesti/gnome-shell-extensions-negesti 
    // Handles multiple gnome-shell versions

    if (Main.wm.addKeybinding && Shell.ActionMode){ // introduced in 3.16
        Main.wm.addKeybinding(action_name,
                              get_settings(), Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.NORMAL,
                              handler
                             );
    } else if (Main.wm.addKeybinding && Shell.KeyBindingMode) { // introduced in 3.7.5
        // Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY,
        Main.wm.addKeybinding(action_name,
                              get_settings(), Meta.KeyBindingFlags.NONE,
                              Shell.KeyBindingMode.NORMAL,
                              handler
                             );
    } else {
        global.display.add_keybinding(
            action_name,
            get_settings(),
            Meta.KeyBindingFlags.NONE,
            handler
        );
    }
}


settings = new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings"});
// Temporary cycle-windows bindings
settings.set_strv("cycle-windows", ["<super><ctrl>period" ])
settings.set_strv("cycle-windows-backward", ["<super><ctrl>comma"])

settings.set_strv("switch-windows", ["<alt>period", "<super>period" ])
settings.set_strv("switch-windows-backward", ["<alt>comma", "<super>comma"])

settings.set_strv("close", ['<super>c'])
settings.set_strv("maximize-horizontally", ['<super>h'])

shell_settings = new Gio.Settings({ schema_id: "org.gnome.shell.keybindings"});
shell_settings.set_strv("toggle-overview", ["<super>space"])

Meta.keybindings_set_custom_handler("cycle-windows",
                                    dynamic_function_ref("live_navigate"));
Meta.keybindings_set_custom_handler("cycle-windows-backward",
                                    dynamic_function_ref("live_navigate"));

Meta.keybindings_set_custom_handler("switch-windows",
                                    dynamic_function_ref("preview_navigate"));
Meta.keybindings_set_custom_handler("switch-windows-backward",
                                    dynamic_function_ref("preview_navigate"));


// Or use "toggle-maximize"?
Meta.keybindings_set_custom_handler("maximize-horizontally",
                                    as_key_handler("toggle_maximize_horizontally"));



// Must use `Meta.keybindings_set_custom_handler` to re-assign handler?
set_action_handler("move-left", dynamic_function_ref("move_left"));
set_action_handler("move-right", dynamic_function_ref("move_right"));
