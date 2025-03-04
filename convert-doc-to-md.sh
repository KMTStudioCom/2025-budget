#!/bin/bash

# 設定目錄路徑
DOC_DIR="./raw"
# 設定 markdown 儲存目錄
MD_DIR="./markdown"

# 先建立 markdown 目錄（如果不存在）
mkdir -p "$MD_DIR"

# 遍歷所有 .doc 檔案並轉換成 .docx
find "$DOC_DIR" -type f -name "*.doc" | while read -r doc_file; do
    doc2docx "$doc_file"
done

# 遍歷所有 .docx 檔案並轉換成 .md，並保持目錄結構
find "$DOC_DIR" -type f -name "*.docx" | while read -r docx_file; do
    # 取得相對路徑
    rel_path="${docx_file#$DOC_DIR/}"
    # 取得目標目錄
    target_dir="$MD_DIR/$(dirname "$rel_path")"
    # 取得目標檔名
    base_name=$(basename "$docx_file" .docx)
    md_file="$target_dir/$base_name.md"

    # 建立對應的目錄結構
    mkdir -p "$target_dir"

    # 轉換 .docx 為 .md
    if [ ! -f "$md_file" ]; then
        markitdown "$docx_file" > "$md_file"
    fi
done