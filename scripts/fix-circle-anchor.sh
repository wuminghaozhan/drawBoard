#!/bin/bash

# 圆形锚点修复脚本
# 用于清除缓存并重新启动开发服务器

echo "🔧 开始修复圆形锚点问题..."

# 1. 清除 Vite 缓存
echo "📦 清除 Vite 缓存..."
rm -rf node_modules/.vite
rm -rf dist

# 2. 检查代码修改
echo "✅ 检查代码修改..."
if grep -q "shapeType.*circle" src/libs/drawBoard/tools/anchor/CircleAnchorHandler.ts; then
    echo "  ✓ CircleAnchorHandler 已正确设置 shapeType"
else
    echo "  ✗ CircleAnchorHandler 未找到 shapeType 设置"
fi

if grep -q "isCircle = anchor.shapeType === 'circle'" src/libs/drawBoard/tools/SelectTool.ts; then
    echo "  ✓ SelectTool 已正确检查 shapeType"
else
    echo "  ✗ SelectTool 未找到 shapeType 检查"
fi

if grep -q "updateHoverAnchor.*boolean" src/libs/drawBoard/tools/SelectTool.ts; then
    echo "  ✓ SelectTool.updateHoverAnchor 已返回 boolean"
else
    echo "  ✗ SelectTool.updateHoverAnchor 未返回 boolean"
fi

# 3. 提示用户
echo ""
echo "🎯 下一步操作："
echo "  1. 重启开发服务器: npm run dev"
echo "  2. 在浏览器中强制刷新:"
echo "     - Windows: Ctrl+F5"
echo "     - Mac: Cmd+Shift+R"
echo "  3. 清除浏览器缓存（如果问题仍然存在）"
echo ""
echo "✅ 修复脚本执行完成！"

