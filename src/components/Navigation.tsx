import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(() => {
    // 从localStorage读取初始状态，默认为展开
    const saved = localStorage.getItem('navigation-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const navItems = [
    { path: '/test', label: '基础画板', icon: '🎨', shortcut: '1' },
    { path: '/stroke', label: '运笔效果', icon: '✏️', shortcut: '2' },
    { path: '/preset', label: '笔触预设', icon: '🖌️', shortcut: '3' },
    { path: '/cursor', label: '鼠标样式', icon: '🖱️', shortcut: '4' },
    { path: '/performance', label: '性能优化', icon: '⚡', shortcut: '5' },
    { path: '/protocol', label: '协议解析', icon: '📋', shortcut: '6' },
    { path: '/edb', label: 'EDB解析', icon: '📁', shortcut: '7' }
  ];

  // 保存状态到localStorage
  useEffect(() => {
    localStorage.setItem('navigation-expanded', JSON.stringify(isExpanded));
  }, [isExpanded]);

  // 键盘快捷键支持
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Ctrl/Cmd + B 切换导航栏
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      setIsExpanded((prev: boolean) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  const toggleNavigation = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <nav 
      className="navigation" 
      style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        padding: '10px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        width: isExpanded ? '170px' : '56px',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* 切换按钮 */}
      <button
        onClick={toggleNavigation}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          border: 'none',
          background: isExpanded ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '12px',
          color: '#667eea',
          marginBottom: '8px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          fontWeight: '600'
        }}
        title={`${isExpanded ? '收起' : '展开'}导航 (Ctrl+B)`}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isExpanded ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)';
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span style={{
          transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'inline-block'
        }}>
          ◀
        </span>
      </button>

      {/* 导航项容器 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3px'
      }}>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px',
              textDecoration: 'none',
              color: location.pathname === item.path ? '#667eea' : '#666',
              background: location.pathname === item.path ? 'linear-gradient(135deg, #f8f9ff 0%, #e8edff 100%)' : 'transparent',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: location.pathname === item.path ? '600' : '500',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              width: '36px',
              height: '36px',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              whiteSpace: 'nowrap',
              position: 'relative',
              overflow: 'hidden',
              border: location.pathname === item.path ? '1px solid rgba(102, 126, 234, 0.2)' : '1px solid transparent'
            }}
            title={`${item.label} (快捷键: ${item.shortcut})`}
            onMouseEnter={(e) => {
              if (location.pathname !== item.path) {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(102, 126, 234, 0.1) 100%)';
                e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.15)';
              }
              e.currentTarget.style.transform = 'translateX(2px)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.15)';
              
              // 显示悬浮提示
              if (!isExpanded) {
                const tooltip = e.currentTarget.querySelector('.nav-tooltip') as HTMLElement;
                if (tooltip) {
                  tooltip.style.opacity = '1';
                  tooltip.style.transform = 'translateY(-50%) translateX(8px)';
                }
              }
            }}
            onMouseLeave={(e) => {
              if (location.pathname !== item.path) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }
              e.currentTarget.style.transform = 'translateX(0)';
              e.currentTarget.style.boxShadow = 'none';
              
              // 隐藏悬浮提示
              if (!isExpanded) {
                const tooltip = e.currentTarget.querySelector('.nav-tooltip') as HTMLElement;
                if (tooltip) {
                  tooltip.style.opacity = '0';
                  tooltip.style.transform = 'translateY(-50%) translateX(0px)';
                }
              }
            }}
          >
            <span style={{ 
              fontSize: '18px',
              flexShrink: 0,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: location.pathname === item.path ? 'drop-shadow(0 0 3px rgba(102, 126, 234, 0.3))' : 'none'
            }}>
              {item.icon}
            </span>
            
            {/* 文字标签 */}
            <span style={{
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? 'translateX(0)' : 'translateX(-10px)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
              fontSize: '14px',
              fontWeight: 'inherit',
              transitionDelay: isExpanded ? '0.1s' : '0s',
              letterSpacing: '0.01em'
            }}>
              {item.label}
            </span>

            {/* 快捷键提示 */}
            {isExpanded && (
              <span style={{
                opacity: isExpanded ? 0.5 : 0,
                fontSize: '11px',
                color: '#999',
                marginLeft: 'auto',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDelay: isExpanded ? '0.15s' : '0s',
                fontWeight: '500'
              }}>
                {item.shortcut}
              </span>
            )}

            {/* 收起状态下的悬浮提示 */}
            {!isExpanded && (
              <div 
                className="nav-tooltip"
                style={{
                  position: 'absolute',
                  left: '52px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  opacity: 0,
                  pointerEvents: 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  zIndex: 1001,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  fontWeight: '500',
                  letterSpacing: '0.01em'
                }}
              >
                {item.label}
                <span style={{ 
                  marginLeft: '8px', 
                  opacity: 0.7,
                  fontSize: '10px' 
                }}>
                  {item.shortcut}
                </span>
                <div style={{
                  position: 'absolute',
                  left: '-4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent',
                  borderRight: '4px solid rgba(0, 0, 0, 0.85)'
                }} />
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* 展开状态下的底部提示 */}
      {isExpanded && (
        <div style={{
          marginTop: '8px',
          padding: '6px 8px',
          fontSize: '10px',
          color: '#999',
          textAlign: 'center',
          borderTop: '1px solid rgba(0, 0, 0, 0.06)',
          opacity: isExpanded ? 1 : 0,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transitionDelay: isExpanded ? '0.2s' : '0s',
          lineHeight: '1.3'
        }}>
          Ctrl+B 切换
        </div>
      )}
    </nav>
  );
};

export default Navigation; 