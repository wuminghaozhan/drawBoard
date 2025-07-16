import React from 'react';

/**
 * 插件管理器组件 - 已废弃
 * 
 * 插件系统已简化为ToolFactory，不再需要复杂的插件管理界面
 */
const PluginManager: React.FC = () => {
  return (
    <div className="plugin-manager">
      <div className="deprecated-notice">
        <h3>插件系统已简化</h3>
        <p>插件系统已被简化为ToolFactory，不再需要复杂的插件管理界面。</p>
        <p>所有绘图工具现在通过内置的工具工厂直接管理。</p>
      </div>
    </div>
  );
};

export default PluginManager; 