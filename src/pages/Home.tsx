import React from 'react';
import { Link } from 'react-router-dom';
import './Home.scss';

const Home: React.FC = () => {
  const featureCards = [
    {
      title: '🎯 选择功能',
      description: '现代化的选择框、多选操作和增强的交互体验',
      path: '/selection',
      color: 'from-blue-500 to-cyan-500',
      features: ['矩形选择框', '多选支持', '选择状态管理', '快捷操作']
    },
    {
      title: '🔄 变换功能',
      description: '专业级的图形变换，包含控制点拖拽和键盘控制',
      path: '/transform',
      color: 'from-purple-500 to-pink-500',
      features: ['控制点显示', '拖拽调整', '键盘移动', '双击进入']
    },
    {
      title: '🔷 几何工具',
      description: '丰富的几何图形工具，支持直线、箭头、多边形等',
      path: '/geometry',
      color: 'from-orange-500 to-red-500',
      features: ['直线/箭头', '多边形', '虚线样式', '填充模式']
    },
    {
      title: '✏️ 运笔效果',
      description: '智能运笔效果，支持压感、速度和角度控制',
      path: '/stroke',
      color: 'from-green-500 to-teal-500',
      features: ['压力感应', '速度响应', '角度检测', '实时渲染']
    },
    {
      title: '🎨 笔触预设',
      description: '丰富的笔触预设，包含钢笔、毛笔、铅笔等多种效果',
      path: '/preset',
      color: 'from-rose-500 to-pink-500',
      features: ['多种预设', '参数调节', '效果预览', '快速切换']
    },
    {
      title: '👆 鼠标样式',
      description: '动态鼠标样式反馈，提供直观的工具状态指示',
      path: '/cursor',
      color: 'from-indigo-500 to-purple-500',
      features: ['动态样式', '状态反馈', '工具指示', '视觉增强']
    },
    {
      title: '⚡ 性能优化',
      description: '先进的渲染优化和内存管理，保证流畅的绘制体验',
      path: '/performance',
      color: 'from-yellow-500 to-orange-500',
      features: ['渲染优化', '内存管理', '性能监控', '自适应模式']
    }
  ];

  const techFeatures = [
    {
      title: '📋 协议解析',
      description: 'EDB文件格式解析和协议处理',
      path: '/protocol',
      icon: '📋'
    },
    {
      title: '📁 EDB演示',
      description: 'EDB文件处理和格式分析演示',
      path: '/edb',
      icon: '📁'
    },
    {
      title: '🧪 测试页面',
      description: '功能测试和开发调试工具',
      path: '/test',
      icon: '🧪'
    }
  ];

  return (
    <div className="home-page">
      {/* 头部横幅 */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="gradient-text">DrawBoard</span>
            <span className="hero-subtitle">专业级绘图板系统</span>
          </h1>
          <p className="hero-description">
            基于Canvas的高性能绘图解决方案，提供完整的绘制工具链和现代化的用户体验
          </p>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-number">10+</span>
              <span className="stat-label">绘制工具</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">6</span>
              <span className="stat-label">核心功能</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">100%</span>
              <span className="stat-label">TypeScript</span>
            </div>
          </div>
        </div>
        <div className="hero-animation">
          <div className="floating-shapes">
            <div className="shape shape-1">🎨</div>
            <div className="shape shape-2">✏️</div>
            <div className="shape shape-3">🖌️</div>
            <div className="shape shape-4">📐</div>
          </div>
        </div>
      </section>

      {/* 核心功能展示 */}
      <section className="features-section">
        <div className="section-header">
          <h2>核心功能</h2>
          <p>探索DrawBoard的强大功能和现代化体验</p>
        </div>
        <div className="features-grid">
          {featureCards.map((feature, index) => (
            <Link key={index} to={feature.path} className="feature-card">
              <div className={`feature-gradient bg-gradient-to-br ${feature.color}`}>
                <div className="feature-content">
                  <h3 className="feature-title">{feature.title}</h3>
                  <p className="feature-description">{feature.description}</p>
                  <ul className="feature-list">
                    {feature.features.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  <div className="feature-arrow">→</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 技术特性 */}
      <section className="tech-section">
        <div className="section-header">
          <h2>技术特性</h2>
          <p>深入了解技术实现和开发工具</p>
        </div>
        <div className="tech-grid">
          {techFeatures.map((tech, index) => (
            <Link key={index} to={tech.path} className="tech-card">
              <div className="tech-icon">{tech.icon}</div>
              <h3 className="tech-title">{tech.title}</h3>
              <p className="tech-description">{tech.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 快速开始 */}
      <section className="quickstart-section">
        <div className="quickstart-content">
          <h2>快速开始</h2>
          <p>选择一个功能开始探索DrawBoard的强大能力</p>
          <div className="quickstart-buttons">
            <Link to="/selection" className="btn btn-primary">
              🎯 开始选择
            </Link>
            <Link to="/transform" className="btn btn-secondary">
              🔄 尝试变换
            </Link>
            <Link to="/stroke" className="btn btn-accent">
              ✏️ 体验运笔
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home; 