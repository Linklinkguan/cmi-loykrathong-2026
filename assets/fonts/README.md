# 认领卡片字体

- `card-rounded-bold.woff2`：源流黑体圆体 Resource Han Rounded CN Bold 0.990 的子集（字体内版权：Copyright © 2018—2019 Cyano Hao；Portions © 2014-2021 Adobe，保留字体名 'Source'），按 SIL Open Font License 1.1 授权，全文见同目录 `OFL.txt`。
- 子集收录 GB2312 一级常用字 3755 个、ASCII、常用中文标点，以及生成时 board.json 里出现过的全部字符，共约 3900 字。字体内部名称改为 `Card Rounded Subset`，以免与原字体名混淆。
- 只在前台打开「我要认领」表单时才加载，用来在浏览器本地画认领卡片。子集里没有的字会由浏览器回退到系统字体。
- 重新生成方法见 tools/build_card_font.py。
