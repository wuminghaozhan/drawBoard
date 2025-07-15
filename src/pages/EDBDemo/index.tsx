import React, { useState } from 'react';
import { EDBParser } from '../../utils/EDBParser';
import { EDBFormatAnalyzer } from '../../utils/EDBFormatAnalyzer';
import './style.scss';

const EDBDemo: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<string>('');
  const [debugResult, setDebugResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParseResult('');
      setDebugResult('');
    }
  };

  const parseFile = async () => {
    if (!file) {
      alert('请先选择文件！');
      return;
    }

    setIsLoading(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 先进行格式分析
      const formatAnalyzer = new EDBFormatAnalyzer(arrayBuffer);
      const formatAnalysis = formatAnalyzer.analyze();
      setDebugResult(formatAnalysis);

      // 然后尝试解析
      const parser = new EDBParser(arrayBuffer);
      const result = parser.parse();
      
      const resultText = JSON.stringify(result, null, 2);
      setParseResult(resultText);
    } catch (error) {
      console.error('解析错误:', error);
      setParseResult(`解析失败: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setParseResult('');
    setDebugResult('');
    setFile(null);
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <div className="edb-demo">
      <h1>EDB文件解析器</h1>
      
      <div className="file-upload">
        <label htmlFor="file-input" style={{ 
          display: 'block', 
          padding: '20px', 
          border: '2px dashed #007bff', 
          borderRadius: '8px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '20px',
          backgroundColor: '#f8f9fa'
        }}>
          <div>📁 点击选择EDB文件</div>
          <div style={{ fontSize: '14px', color: '#6c757d', marginTop: '5px' }}>
            或者拖拽文件到此处
          </div>
        </label>
        <input
          id="file-input"
          type="file"
          accept=".edb"
          onChange={handleFileChange}
          className="file-input"
          style={{ display: 'none' }}
        />
        <div className="button-group">
          <button 
            onClick={parseFile} 
            disabled={!file || isLoading}
            className="parse-btn"
          >
            {isLoading ? '解析中...' : '解析文件'}
          </button>
          <button 
            onClick={clearResults} 
            className="clear-btn"
          >
            清除结果
          </button>
        </div>
      </div>

      {file && (
        <div className="file-info">
          <h3>文件信息</h3>
          <p><strong>文件名:</strong> {file.name}</p>
          <p><strong>文件大小:</strong> {(file.size / 1024).toFixed(2)} KB</p>
          <p><strong>文件类型:</strong> {file.type || 'application/octet-stream'}</p>
        </div>
      )}

      <div className="results">
        {debugResult && (
          <div className="debug-section">
            <h3>调试分析</h3>
            <pre className="debug-result">{debugResult}</pre>
          </div>
        )}

        {parseResult && (
          <div className="parse-section">
            <h3>解析结果</h3>
            <pre className="parse-result">{parseResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default EDBDemo; 