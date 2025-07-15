import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/test', label: '基础画板', icon: '🎨' },
    { path: '/stroke', label: '运笔效果', icon: '✏️' },
    { path: '/preset', label: '笔触预设', icon: '🖌️' },
    { path: '/performance', label: '性能优化', icon: '⚡' },
    { path: '/protocol', label: '协议解析', icon: '📋' },
    { path: '/edb', label: 'EDB解析', icon: '📁' }
  ];

  return (
    <nav className="navigation" style={{
      position: 'fixed',
      top: '10px',
      left: '10px',
      zIndex: 1000,
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(0, 0, 0, 0.1)',
      borderRadius: '8px',
      padding: '8px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              textDecoration: 'none',
              color: location.pathname === item.path ? '#667eea' : '#666',
              background: location.pathname === item.path ? '#f8f9ff' : 'transparent',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: location.pathname === item.path ? '600' : '400',
              transition: 'all 0.3s ease',
              minWidth: '120px'
            }}
            title={item.label}
          >
            <span style={{ fontSize: '16px' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default Navigation; 