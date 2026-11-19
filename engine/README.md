# 发动机 v1

纯静态、只读的社区思考页面。数据以 `data/engine.json` 为准。

- `index.html`、`assets/engine.css`、`assets/engine.js`：页面及交互。
- `data/engine.json`：数据；`设计_v1.md`：设计说明。
- `tools/validate.py`：数据校验；`tools/build_standalone.py`：生成离线单文件；`tools/smoke.py`：浏览器冒烟测试。
- `dist/engine_standalone.html`：构建后的离线版；`shots/v1.2/`：测试截图。

在本目录运行 `python3 -m http.server`，浏览器打开 `http://localhost:8000/`。离线版可直接打开。

## v1.2 界面小修

桌面图压缩至首屏，外围节点按类型分段、区分形状并支持悬停、聚焦和全部标签；手机五环导航、折叠控件与说明文字同步调整。数据保持不变。

## 新增经验并修订节点

例如在 `experiences` 数组末尾追加（日期和文字按实际情况填写）：

```json
{
  "id": "x_new_observation",
  "date": "2026-11-20",
  "title": "新的观察",
  "kind": "real",
  "ref": "日志新条目",
  "effects": [
    {"node": "c_money", "effect": "revises", "note": "补充对连接方式的理解。"}
  ]
}
```

在 `c_money` 的 `versions` 中，给当前最后一版补上 `"to": "2026-11-20"`，然后追加：

```json
{
  "v": 3,
  "from": "2026-11-20",
  "summary": "修订后的理解。",
  "by": "x_new_observation"
}
```

把 `meta.data_version` 加一，更新 `meta.updated_at`。版本区间使用左闭右开：旧版 `to` 与新版 `from` 相同；未写 `to` 的旧版以后一版起始日为结束。`by` 指向触发修订的经验。

## 新增突破口或废弃节点

在 `nodes` 中新增完整节点，设 `kind` 为 `breakthrough`，用 `stage` 指定所属环；在 `edges` 中新增 `rel: "attempts"` 的边，从突破口指向它尝试打开的节点。节点需要唯一 `id`、标题、说明、作者、状态、出处、验证、`since` 和版本等字段，可参照现有数据。

废弃时保留节点，添加 `deprecated` 对象，例如 `{"at":"2026-11-20","by":"x_new_observation","note":"已被新理解取代。"}`，并用经验的 `deprecates` effect 记录原因，不删除历史。

修改后依次运行：

```sh
python3 tools/validate.py
python3 tools/build_standalone.py
python3 tools/smoke.py
```

## 发布

线上路径：https://linklinkguan.github.io/cmi-loykrathong-2026/engine/

发布时先在部署仓库 `/workspace/lk-board-deploy/` 执行 `git fetch && git pull --rebase`，然后将本目录的 `index.html`、`assets/`、`data/`、`README.md` 复制到部署仓库的 `engine/`。仅执行 `git add engine/`，提交后正常推送，不强推。不要使用 `tools/deploy.sh`，它会跳过 engine。

## v1.3 页面小修

手机五环导航放大环名和序号，长环名分行并扩大点击区域；桌面放大标签、调整环 5 提示和节点间距，并为首屏图框留出底部余量。运行上述三项命令可校验数据、重建独立版并生成 `shots/v1.3/` 截图。
