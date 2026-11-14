#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubCard {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub label_colors: HashMap<String, String>,
    #[serde(default)]
    pub assignee: String,
    #[serde(default)]
    pub due_date: Option<String>,
    pub column_id: String,
    #[serde(default)]
    pub sub_board: Option<Box<SubBoard>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubColumn {
    pub id: String,
    pub title: String,
    pub cards: Vec<SubCard>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubBoard {
    pub columns: Vec<SubColumn>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub title: String,
    pub description: String,
    pub labels: Vec<String>,
    #[serde(default)]
    pub label_colors: HashMap<String, String>,
    #[serde(default)]
    pub sub_board: Option<SubBoard>,
    pub assignee: String,
    #[serde(default)]
    pub due_date: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub id: String,
    pub title: String,
    pub cards: Vec<Card>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub icon: String,
    pub updated_at: u64,
    pub columns: Vec<Column>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCard {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub label_colors: HashMap<String, String>,
    #[serde(default)]
    pub sub_board: Option<SubBoard>,
    #[serde(default)]
    pub assignee: String,
    #[serde(default)]
    pub due_date: Option<String>,
}

pub struct AppState {
    pub board: Mutex<Board>,
    pub path: PathBuf,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn default_board() -> Board {
    Board {
        id: "board-main".into(),
        title: "我的项目看板".into(),
        icon: "◆".into(),
        updated_at: now(),
        columns: vec![
            Column {
                id: "backlog".into(),
                title: "待办".into(),
                cards: vec![Card {
                    id: Uuid::new_v4().to_string(),
                    title: "欢迎使用看板".into(),
                    description:
                        "拖动卡片或使用右上角按钮开始管理任务。agent 可以读取 data/board.json。"
                            .into(),
                    labels: vec!["示例".into()],
                    label_colors: HashMap::from([("示例".into(), "purple".into())]),
                    sub_board: None,
                    assignee: "".into(),
                    due_date: None,
                    created_at: now(),
                    updated_at: now(),
                }],
            },
            Column {
                id: "doing".into(),
                title: "进行中".into(),
                cards: vec![],
            },
            Column {
                id: "done".into(),
                title: "已完成".into(),
                cards: vec![],
            },
        ],
    }
}

#[tauri::command]
fn update_board_icon(icon: String, state: State<'_, AppState>) -> Result<Board, String> {
    let mut board = state.board.lock().map_err(|e| e.to_string())?;
    board.icon = icon;
    board.updated_at = now();
    let result = board.clone();
    drop(board);
    persist(&state)?;
    Ok(result)
}

fn persist(state: &AppState) -> Result<(), String> {
    let board = state.board.lock().map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(&*board).map_err(|e| e.to_string())?;
    if let Some(parent) = state.path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&state.path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_board(state: State<'_, AppState>) -> Result<Board, String> {
    state
        .board
        .lock()
        .map(|b| b.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_card(
    column_id: String,
    input: NewCard,
    state: State<'_, AppState>,
) -> Result<Board, String> {
    let mut board = state.board.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let card = Card {
        id: Uuid::new_v4().to_string(),
        title: input.title,
        description: input.description,
        labels: input.labels,
        label_colors: input.label_colors,
        sub_board: input.sub_board,
        assignee: input.assignee,
        due_date: input.due_date,
        created_at: timestamp,
        updated_at: timestamp,
    };
    let column = board
        .columns
        .iter_mut()
        .find(|c| c.id == column_id)
        .ok_or("column not found")?;
    column.cards.push(card);
    board.updated_at = timestamp;
    let result = board.clone();
    drop(board);
    persist(&state)?;
    Ok(result)
}

#[tauri::command]
fn update_card(
    card_id: String,
    input: NewCard,
    state: State<'_, AppState>,
) -> Result<Board, String> {
    let mut board = state.board.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let card = board
        .columns
        .iter_mut()
        .find_map(|column| column.cards.iter_mut().find(|c| c.id == card_id));
    let Some(card) = card else {
        return Err("card not found".into());
    };
    card.title = input.title;
    card.description = input.description;
    card.labels = input.labels;
    card.label_colors = input.label_colors;
    card.sub_board = input.sub_board;
    card.assignee = input.assignee;
    card.due_date = input.due_date;
    card.updated_at = timestamp;
    board.updated_at = timestamp;
    let result = board.clone();
    drop(board);
    persist(&state)?;
    Ok(result)
}

#[tauri::command]
fn move_card(
    card_id: String,
    from_column: String,
    to_column: String,
    state: State<'_, AppState>,
) -> Result<Board, String> {
    let mut board = state.board.lock().map_err(|e| e.to_string())?;
    let card = {
        let from = board
            .columns
            .iter_mut()
            .find(|c| c.id == from_column)
            .ok_or("source column not found")?;
        let index = from
            .cards
            .iter()
            .position(|c| c.id == card_id)
            .ok_or("card not found")?;
        from.cards.remove(index)
    };
    let target = board
        .columns
        .iter_mut()
        .find(|c| c.id == to_column)
        .ok_or("target column not found")?;
    target.cards.push(card);
    board.updated_at = now();
    let result = board.clone();
    drop(board);
    persist(&state)?;
    Ok(result)
}

#[tauri::command]
fn delete_card(card_id: String, state: State<'_, AppState>) -> Result<Board, String> {
    let mut board = state.board.lock().map_err(|e| e.to_string())?;
    let location = board
        .columns
        .iter()
        .enumerate()
        .find_map(|(column_index, column)| {
            column
                .cards
                .iter()
                .position(|c| c.id == card_id)
                .map(|card_index| (column_index, card_index))
        });
    if let Some((column_index, card_index)) = location {
        board.columns[column_index].cards.remove(card_index);
        board.updated_at = now();
        let result = board.clone();
        drop(board);
        persist(&state)?;
        return Ok(result);
    }
    Err("card not found".into())
}

#[tauri::command]
fn export_board(state: State<'_, AppState>) -> Result<String, String> {
    persist(&state)?;
    Ok(state.path.to_string_lossy().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("board.json");
            let board = if path.exists() {
                fs::read_to_string(&path)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_else(default_board)
            } else {
                default_board()
            };
            app.manage(AppState {
                board: Mutex::new(board),
                path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_board,
            create_card,
            update_card,
            update_board_icon,
            move_card,
            delete_card,
            export_board
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
