import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.scss';

const Navigation: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const navGroups = [
    {
      title: '导航',
      items: [
        { path: '/', label: '🏠 首页', description: '功能概览和快速导航' },
      ]
    },
    {
      title: '核心功能',
      items: [
        { path: '/selection', label: '🎯 选择功能', description: '选择框、多选、操作' },
        { path: '/transform', label: '🔄 变换功能', description: '控制点、拖拽调整、键盘移动' },
        { path: '/geometry', label: '🔷 几何工具', description: '直线、箭头、多边形绘制' },
      ]
    },
    {
      title: '绘制体验',
      items: [
        { path: '/stroke', label: '✏️ 运笔效果', description: '压感、速度、角度控制' },
        { path: '/preset', label: '🎨 笔触预设', description: '钢笔、毛笔、铅笔等预设' },
        { path: '/cursor', label: '👆 鼠标样式', description: '动态鼠标样式反馈' },
      ]
    },
    {
      title: '技术探索',
      items: [
        { path: '/performance', label: '⚡ 性能优化', description: '渲染优化、内存管理' },
        { path: '/protocol', label: '📋 协议解析', description: 'EDB文件格式解析' },
        { path: '/edb', label: '📁 EDB演示', description: 'EDB文件处理演示' },
        { path: '/virtual-layer', label: '📄 虚拟图层', description: '虚拟图层管理演示' },
      ]
    },
    {
      title: '系统管理',
      items: [
        { path: '/error-handling', label: '🛡️ 错误处理', description: '错误处理和资源管理' },
      ]
    },
    {
      title: '开发调试',
      items: [
        { path: '/test', label: '🧪 测试页面', description: '功能测试和调试' },
      ]
    }
  ];

  const toggleNav = () => {
    setIsCollapsed(!isCollapsed);
  };

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'b') {
        event.preventDefault();
        toggleNav();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <nav className={`navigation ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="nav-header">
        <Link to="/" className="nav-brand">
          <span className="brand-icon">🎨</span>
          {!isCollapsed && <span className="brand-text">DrawBoard</span>}
        </Link>
        <button 
          className="nav-toggle" 
          onClick={toggleNav}
          aria-label="切换导航菜单"
        >
          <span className="toggle-icon">
            {isCollapsed ? '→' : '←'}
          </span>
        </button>
      </div>

      <div className="nav-content">
        <div className="nav-groups">
          {navGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="nav-group">
              {!isCollapsed && <div className="group-title">{group.title}</div>}
              <ul className="nav-list">
                {group.items.map(item => (
                  <li key={item.path} className="nav-item">
                    <Link
                      to={item.path}
                      className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                      title={isCollapsed ? `${item.label}: ${item.description}` : undefined}
                    >
                      <span className="link-icon">
                        {item.label.split(' ')[0]}
                      </span>
                      {!isCollapsed && (
                        <span className="link-content">
                          <span className="link-label">{item.label.split(' ').slice(1).join(' ')}</span>
                          <span className="link-description">{item.description}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="nav-footer">
          {!isCollapsed && (
            <div className="nav-tip">
              <span className="tip-icon">💡</span>
              <span className="tip-text">
                按 <kbd>Ctrl+B</kbd> 切换导航
              </span>
            </div>
          )}
          <div className="nav-version">
            v1.0.0
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation; 