use keyring::Entry;

const SERVICE_NAME: &str = "com.mdschoff.satchel";

/// API keys go in the OS keychain (macOS Keychain / Windows Credential
/// Manager / Linux Secret Service) rather than app storage, so they never
/// end up in a plain file or the frontend's localStorage.
#[tauri::command]
pub fn save_secret(provider_id: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &provider_id).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_secret(provider_id: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, &provider_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_secret(provider_id: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &provider_id).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
