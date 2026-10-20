# liuyangdev.site

极限刹车挑战直接部署在 https://liuyangdev.site/ 。所有后续项目更新替换域名首页，不创建游戏子目录。

- `index.html`：当前游戏首页。
- `vendor/three.min.js`：游戏渲染依赖。
- `assets/`：字体与授权文件。
- `CNAME`：保留域名绑定，不随页面更新修改。

验证：

```sh
node tests/root-layout.cjs
# 需要已安装 playwright-core 和 Chromium；也可通过 PLAYWRIGHT_CORE 指定模块路径。
node tests/car-motion.cjs
node tests/car-motion.cjs https://liuyangdev.site/
```

历史观测站首页保留在 Git 历史中；原 `/brake/` 发布目录已删除。
