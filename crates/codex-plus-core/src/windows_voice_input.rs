use crate::settings::BackendSettings;

#[cfg(windows)]
use std::sync::{
    Mutex, OnceLock,
    atomic::{AtomicBool, Ordering},
};

#[cfg(windows)]
use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_BACK,
    VK_CAPITAL, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_F3, VK_F4, VK_H, VK_HOME, VK_INSERT,
    VK_LCONTROL, VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_NEXT, VK_PRIOR, VK_RCONTROL,
    VK_RETURN, VK_RIGHT, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
    keybd_event,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG,
    SetWindowsHookExW, TranslateMessage, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
    WM_SYSKEYUP,
};

#[cfg(windows)]
static STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static HOTKEY_STATE: OnceLock<Mutex<VoiceHotkeyState>> = OnceLock::new();

#[cfg(windows)]
#[derive(Debug, Clone, Copy)]
struct VoiceHotkeyState {
    hold: VoiceShortcut,
    toggle: VoiceShortcut,
    hold_down: bool,
    toggle_down: bool,
}

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct VoiceShortcut {
    key: u32,
    modifiers: u8,
}

#[cfg(windows)]
const MOD_CTRL: u8 = 1;
#[cfg(windows)]
const MOD_ALT: u8 = 1 << 1;
#[cfg(windows)]
const MOD_SHIFT: u8 = 1 << 2;
#[cfg(windows)]
const MOD_WIN: u8 = 1 << 3;

#[cfg(windows)]
impl VoiceHotkeyState {
    fn from_settings(settings: &BackendSettings) -> Self {
        Self {
            hold: voice_shortcut(&settings.global_voice_input_hold_hotkey)
                .unwrap_or_else(|| VoiceShortcut::new(VK_F3.0 as u32, 0)),
            toggle: voice_shortcut(&settings.global_voice_input_toggle_hotkey)
                .unwrap_or_else(|| VoiceShortcut::new(VK_F4.0 as u32, 0)),
            hold_down: false,
            toggle_down: false,
        }
    }
}

#[cfg(windows)]
impl VoiceShortcut {
    fn new(key: u32, modifiers: u8) -> Self {
        Self { key, modifiers }
    }

    fn matches_key(self, vk_code: u32) -> bool {
        key_matches(self.key, vk_code)
    }

    fn modifiers_down(self) -> bool {
        modifiers_down(self.modifiers)
    }
}

#[cfg(windows)]
pub fn start_global_voice_input(settings: &BackendSettings) {
    if !settings.global_voice_input_enabled {
        return;
    }
    let state = VoiceHotkeyState::from_settings(settings);
    if STARTED.swap(true, Ordering::SeqCst) {
        update_hotkeys(state);
        return;
    }
    let _ = HOTKEY_STATE.set(Mutex::new(state));
    std::thread::spawn(run_keyboard_hook);
}

#[cfg(not(windows))]
pub fn start_global_voice_input(_settings: &BackendSettings) {}

#[cfg(windows)]
fn update_hotkeys(state: VoiceHotkeyState) {
    if let Some(current) = HOTKEY_STATE.get() {
        *current.lock().expect("voice hotkey state") = state;
    }
}

#[cfg(windows)]
fn run_keyboard_hook() {
    let result = unsafe {
        SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(voice_keyboard_proc),
            HINSTANCE::default(),
            0,
        )
    };
    if let Err(error) = result {
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "voice.global_hotkey_hook_failed",
            serde_json::json!({ "message": error.to_string() }),
        );
        STARTED.store(false, Ordering::SeqCst);
        return;
    }
    let mut message = MSG::default();
    loop {
        let code = unsafe { GetMessageW(&mut message, None, 0, 0) };
        if code.0 <= 0 {
            break;
        }
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

#[cfg(windows)]
unsafe extern "system" fn voice_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let event = unsafe { *(l_param.0 as *const KBDLLHOOKSTRUCT) };
        if !event.flags.contains(LLKHF_INJECTED)
            && handle_voice_hotkey(event.vkCode, w_param.0 as u32)
        {
            return LRESULT(1);
        }
    }
    unsafe { CallNextHookEx(None, n_code, w_param, l_param) }
}

#[cfg(windows)]
fn handle_voice_hotkey(vk_code: u32, message: u32) -> bool {
    let Some(state) = HOTKEY_STATE.get() else {
        return false;
    };
    let mut state = state.lock().expect("voice hotkey state");
    if state.hold.matches_key(vk_code)
        && (state.hold.modifiers_down() || state.hold_down && is_keyup_message(message))
    {
        return handle_hold_hotkey(&mut state, message);
    }
    if state.toggle.matches_key(vk_code)
        && (state.toggle.modifiers_down() || state.toggle_down && is_keyup_message(message))
    {
        return handle_toggle_hotkey(&mut state, message);
    }
    false
}

#[cfg(windows)]
fn handle_hold_hotkey(state: &mut VoiceHotkeyState, message: u32) -> bool {
    match message {
        WM_KEYDOWN | WM_SYSKEYDOWN if !state.hold_down => {
            state.hold_down = true;
            trigger_windows_voice_typing();
        }
        WM_KEYUP | WM_SYSKEYUP if state.hold_down => {
            state.hold_down = false;
            trigger_windows_voice_typing();
        }
        _ => {}
    }
    true
}

#[cfg(windows)]
fn handle_toggle_hotkey(state: &mut VoiceHotkeyState, message: u32) -> bool {
    match message {
        WM_KEYDOWN | WM_SYSKEYDOWN if !state.toggle_down => {
            state.toggle_down = true;
            trigger_windows_voice_typing();
        }
        WM_KEYUP | WM_SYSKEYUP => state.toggle_down = false,
        _ => {}
    }
    true
}

#[cfg(windows)]
fn is_keyup_message(message: u32) -> bool {
    matches!(message, WM_KEYUP | WM_SYSKEYUP)
}

#[cfg(windows)]
fn trigger_windows_voice_typing() {
    send_key(VK_LWIN.0 as u8, false, true);
    send_key(VK_H.0 as u8, false, false);
    send_key(VK_H.0 as u8, true, false);
    send_key(VK_LWIN.0 as u8, true, true);
}

#[cfg(windows)]
fn send_key(key: u8, key_up: bool, extended: bool) {
    let mut flags = KEYBD_EVENT_FLAGS(0);
    if key_up {
        flags |= KEYEVENTF_KEYUP;
    }
    if extended {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    unsafe {
        keybd_event(key, 0, flags, 0);
    }
}

#[cfg(windows)]
fn voice_shortcut(value: &str) -> Option<VoiceShortcut> {
    let parts: Vec<String> = value
        .split('+')
        .map(normalize_shortcut_token)
        .filter(|part| !part.is_empty())
        .collect();
    let (primary, modifier_parts) = parts.split_last()?;
    let modifiers = modifier_parts.iter().try_fold(0, |mask, part| {
        modifier_mask(part).map(|modifier| mask | modifier)
    })?;
    if let Some(modifier_key) = modifier_key(primary) {
        return (modifier_parts.is_empty()).then_some(VoiceShortcut::new(modifier_key, 0));
    }
    key_code(primary).map(|key| VoiceShortcut::new(key, modifiers))
}

#[cfg(windows)]
fn normalize_shortcut_token(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|character| !character.is_whitespace())
        .flat_map(char::to_uppercase)
        .collect()
}

#[cfg(windows)]
fn modifier_mask(value: &str) -> Option<u8> {
    match value {
        "CTRL" | "CONTROL" | "LEFTCTRL" | "LEFTCONTROL" | "LCTRL" | "LCONTROL" | "RIGHTCTRL"
        | "RIGHTCONTROL" | "RCTRL" | "RCONTROL" => Some(MOD_CTRL),
        "ALT" | "MENU" | "LEFTALT" | "LALT" | "LEFTMENU" | "LMENU" | "RIGHTALT" | "RALT"
        | "RIGHTMENU" | "RMENU" => Some(MOD_ALT),
        "SHIFT" | "LEFTSHIFT" | "LSHIFT" | "RIGHTSHIFT" | "RSHIFT" => Some(MOD_SHIFT),
        "WIN" | "WINDOWS" | "META" | "CMD" | "LEFTWIN" | "LWIN" | "RIGHTWIN" | "RWIN" => {
            Some(MOD_WIN)
        }
        _ => None,
    }
}

#[cfg(windows)]
fn modifier_key(value: &str) -> Option<u32> {
    match value {
        "CTRL" | "CONTROL" => Some(VK_CONTROL.0 as u32),
        "LEFTCTRL" | "LEFTCONTROL" | "LCTRL" | "LCONTROL" => Some(VK_LCONTROL.0 as u32),
        "RIGHTCTRL" | "RIGHTCONTROL" | "RCTRL" | "RCONTROL" => Some(VK_RCONTROL.0 as u32),
        "ALT" | "MENU" => Some(VK_MENU.0 as u32),
        "LEFTALT" | "LALT" | "LEFTMENU" | "LMENU" => Some(VK_LMENU.0 as u32),
        "RIGHTALT" | "RALT" | "RIGHTMENU" | "RMENU" => Some(VK_RMENU.0 as u32),
        "SHIFT" => Some(VK_SHIFT.0 as u32),
        "LEFTSHIFT" | "LSHIFT" => Some(VK_LSHIFT.0 as u32),
        "RIGHTSHIFT" | "RSHIFT" => Some(VK_RSHIFT.0 as u32),
        "WIN" | "WINDOWS" | "META" | "CMD" | "LEFTWIN" | "LWIN" => Some(VK_LWIN.0 as u32),
        "RIGHTWIN" | "RWIN" => Some(VK_RWIN.0 as u32),
        _ => None,
    }
}

#[cfg(windows)]
fn key_code(value: &str) -> Option<u32> {
    if let Some(number) = value
        .strip_prefix('F')
        .and_then(|suffix| suffix.parse::<u32>().ok())
    {
        return (1..=24).contains(&number).then_some(0x70 + number - 1);
    }
    if value.len() == 1 {
        let byte = value.as_bytes()[0];
        if byte.is_ascii_uppercase() || byte.is_ascii_digit() {
            return Some(byte as u32);
        }
    }
    if let Some(number) = value
        .strip_prefix("NUMPAD")
        .and_then(|suffix| suffix.parse::<u32>().ok())
    {
        return (0..=9).contains(&number).then_some(0x60 + number);
    }
    match value {
        "SPACE" => Some(VK_SPACE.0 as u32),
        "TAB" => Some(VK_TAB.0 as u32),
        "ENTER" | "RETURN" => Some(VK_RETURN.0 as u32),
        "BACKSPACE" | "BACK" => Some(VK_BACK.0 as u32),
        "DELETE" | "DEL" => Some(VK_DELETE.0 as u32),
        "INSERT" | "INS" => Some(VK_INSERT.0 as u32),
        "HOME" => Some(VK_HOME.0 as u32),
        "END" => Some(VK_END.0 as u32),
        "PAGEUP" | "PRIOR" => Some(VK_PRIOR.0 as u32),
        "PAGEDOWN" | "NEXT" => Some(VK_NEXT.0 as u32),
        "UP" | "ARROWUP" => Some(VK_UP.0 as u32),
        "DOWN" | "ARROWDOWN" => Some(VK_DOWN.0 as u32),
        "LEFT" | "ARROWLEFT" => Some(VK_LEFT.0 as u32),
        "RIGHT" | "ARROWRIGHT" => Some(VK_RIGHT.0 as u32),
        "CAPSLOCK" => Some(VK_CAPITAL.0 as u32),
        _ => None,
    }
}

#[cfg(windows)]
fn key_matches(configured_key: u32, vk_code: u32) -> bool {
    let controls = [
        VK_CONTROL.0 as u32,
        VK_LCONTROL.0 as u32,
        VK_RCONTROL.0 as u32,
    ];
    let alts = [VK_MENU.0 as u32, VK_LMENU.0 as u32, VK_RMENU.0 as u32];
    let shifts = [VK_SHIFT.0 as u32, VK_LSHIFT.0 as u32, VK_RSHIFT.0 as u32];
    match configured_key {
        key if key == VK_CONTROL.0 as u32 => controls.contains(&vk_code),
        key if key == VK_MENU.0 as u32 => alts.contains(&vk_code),
        key if key == VK_SHIFT.0 as u32 => shifts.contains(&vk_code),
        _ => configured_key == vk_code,
    }
}

#[cfg(windows)]
fn modifiers_down(mask: u8) -> bool {
    (mask & MOD_CTRL == 0
        || any_key_down(&[
            VK_CONTROL.0 as u32,
            VK_LCONTROL.0 as u32,
            VK_RCONTROL.0 as u32,
        ]))
        && (mask & MOD_ALT == 0
            || any_key_down(&[VK_MENU.0 as u32, VK_LMENU.0 as u32, VK_RMENU.0 as u32]))
        && (mask & MOD_SHIFT == 0
            || any_key_down(&[VK_SHIFT.0 as u32, VK_LSHIFT.0 as u32, VK_RSHIFT.0 as u32]))
        && (mask & MOD_WIN == 0 || any_key_down(&[VK_LWIN.0 as u32, VK_RWIN.0 as u32]))
}

#[cfg(windows)]
fn any_key_down(keys: &[u32]) -> bool {
    keys.iter().any(|key| {
        let state = unsafe { GetAsyncKeyState(*key as i32) };
        state as u16 & 0x8000 != 0
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn parses_voice_shortcuts() {
        assert_eq!(
            voice_shortcut("F3"),
            Some(VoiceShortcut::new(VK_F3.0 as u32, 0))
        );
        assert_eq!(
            voice_shortcut(" f4 "),
            Some(VoiceShortcut::new(VK_F4.0 as u32, 0))
        );
        assert_eq!(
            voice_shortcut("Alt+Space"),
            Some(VoiceShortcut::new(VK_SPACE.0 as u32, MOD_ALT))
        );
        assert_eq!(
            voice_shortcut("Ctrl + Alt + Space"),
            Some(VoiceShortcut::new(VK_SPACE.0 as u32, MOD_CTRL | MOD_ALT))
        );
        assert_eq!(
            voice_shortcut("Shift+F3"),
            Some(VoiceShortcut::new(VK_F3.0 as u32, MOD_SHIFT))
        );
        assert_eq!(
            voice_shortcut("RightCtrl"),
            Some(VoiceShortcut::new(VK_RCONTROL.0 as u32, 0))
        );
        assert_eq!(voice_shortcut("F24"), Some(VoiceShortcut::new(0x87, 0)));
        assert_eq!(voice_shortcut("F25"), None);
        assert_eq!(voice_shortcut("Ctrl+Alt"), None);
        assert_eq!(voice_shortcut(""), None);
    }
}
