import React, { useState, useEffect, useMemo, FormEvent } from 'react';
// 注意: このパスが正しいか、実際のプロジェクト構造に合わせて確認してください
import { configSchema } from '../validations/schema.ts'; 
import { useNavigate } from 'react-router-dom';

// 時給設定のインターフェース定義
interface WageConfig {
  id: string;
  day: string; // '月', '火', ... '日'
  jobName: string;
  startTime: string;
  endTime: string;
  wage: number;
  transport: number;
  allowance: number;
  createdAt: string; // バックエンドから受け取る想定
  // 必要であれば updatedAt なども追加
}

// 曜日表示順序
const DAYS_OF_WEEK = ['月', '火', '水', '木', '金', '土', '日'];

const Config = () => {
  const navigate = useNavigate();

  const handleHomeClick = () => {
    navigate('/');
  };

  // --- State定義 ---
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [jobName, setjobName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [wage, setWage] = useState(""); // 初期値は空文字のまま number input が扱える
  const [transport, setTransport] = useState("");
  const [allowance, setAllowance] = useState("");
  const [wageConfigs, setWageConfigs] = useState<WageConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null as { type: 'success' | 'error'; text: string } | null);

  // --- API関連 ---
  const baseUrl = process.env.REACT_APP_API_BASE_URL
  const apiEndpoint = baseUrl;

  // 既存の時給設定を取得する関数
  const fetchWageConfigs = async () => {
    setLoading(true);
    setMessage(null);
    const url = `${apiEndpoint}?action=getConfigs`;
    console.log(`[fetchWageConfigs] Fetching from: ${url}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log(`[fetchWageConfigs] Response status: ${response.status}`);

      if (!response.ok) {
        const status = response.status;
        let errorText = await response.text();
        console.error(`[fetchWageConfigs] HTTPエラー発生: Status ${status}, Body: ${errorText}`);

        let errorMessage = `Failed to fech wage config (status: ${status})`;
        if (status === 502) {
          errorMessage = "Server is currently unavailable. Check if server is running";
        } else {
           try {
             const errorData = JSON.parse(errorText);
             errorMessage = errorData.message || errorData.error || errorMessage;
           } catch (e) {
             if (errorText) {
               errorMessage += ` - ${errorText}`;
             }
           }
        }
        setMessage({ type: 'error', text: errorMessage });
        throw new Error(`[fetchWageConfigs] Failed with status ${status}`);
      }

      const data: WageConfig[] = await response.json();
      console.log('[fetchWageConfigs] Data received:', data);

      setWageConfigs(data.sort((a, b) => {
        const dayCompare = DAYS_OF_WEEK.indexOf(a.day) - DAYS_OF_WEEK.indexOf(b.day);
        if (dayCompare !== 0) return dayCompare;
        return (a.startTime || "").localeCompare(b.startTime || "");
      }));
      console.log('[fetchWageConfigs] State updated successfully');

    } catch (error: any) {
      console.error('[fetchWageConfigs] Error while feching or calculating', error);
      setWageConfigs([]);
      if (!message) {
         setMessage({ type: 'error', text: `Error while feching data: ${error.message || 'Unknown error'}` });
      }
    } finally {
      setLoading(false);
      console.log('[fetchWageConfigs] finally block executed');
    }
  };

  // 時給設定を削除する関数
  const deleteWageConfig = async (id: string) => {
    if (!window.confirm(`Are you sure deleting wage config for ID: ${id}?`)) {
      return;
    }
    setMessage(null);
    setLoading(true);
    try {
      console.log(`Sending request for deleting ID: ${id}`);

      const deletePayload = { action: 'deleteConfig', id }; // 修正: action プロパティをボディに追加
      console.log('Request data for deleting:', deletePayload);

      const response = await fetch(apiEndpoint, { // 修正: ベースURLを使用
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deletePayload)
      });

      console.log('Response status for deleting request:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: 'Failed to delete' };
        }
        throw new Error(errorData.message || errorData.error || `Failed to delete (Status: ${response.status})`);
      }

      const result = await response.json();
      console.log('Delete successful:', result);

      setMessage({ type: 'success', text: result.message || `Delete ID: ${id} ` });
      fetchWageConfigs();

    } catch (error: any) {
      console.error('Error deleting wage config:', error);
      setMessage({ type: 'error', text: `Error in deleting: ${error.message || 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  // POST処理を行う関数 (新規追加/更新)
  const postConfig = async (dataToSend: Omit<WageConfig, 'id' | 'createdAt'> & { day: string[] }) => {
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        action: 'saveConfig',
        ...dataToSend
      };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log('Response status for saving:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error text:', errorText);

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: 'Failed to save' };
        }

        throw new Error(errorData.message || errorData.error || 'Failed to save');
      }

      const result = await response.json();
      console.log('Save successfully:', result);
      setMessage({ type: 'success', text: result.message || 'Saved configure' });

      resetForm();
      fetchWageConfigs();

    } catch (error: any) {
      console.error('Error posting config:', error);
      setMessage({ type: 'error', text: `Error in saving: ${error.message || 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  // --- フォーム関連ハンドラー ---
  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const resetForm = () => {
    setSelectedDays([]);
    setjobName("");
    setStartTime("");
    setEndTime("");
    setWage("");
    setTransport("");
    setAllowance("");
  };

  // フォーム送信ハンドラー
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // 1. バリデーション用のデータ準備 (stateから直接取得)
    const dataToValidate = {
      days: selectedDays,
      jobName: jobName, // state の jobName を直接使用
      startTime,
      endTime,
      // number 型に変換する前に Zod が文字列として検証できるようにする
      wage: wage === "" ? undefined : wage,
      transport: transport === "" ? undefined : transport,
      allowance: allowance === "" ? undefined : allowance,
    };

    // 2. Zod スキーマでバリデーション
    const result = configSchema.safeParse(dataToValidate);

    if (!result.success) {
      const errorMessages = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
      console.error("Validation Errors:", result.error.format());
      setMessage({ type: 'error', text: `Error in input data: ${errorMessages}` });
      return;
    }

    // 3. API 送信用のデータ準備 (バリデーション済みデータを使用)
    //    - スキーマから undefined が返る可能性も考慮し、デフォルト値を設定
    //    - 数値型は Number() で変換
    const dataToSend = {
      day: result.data.days, // バックエンドが期待する配列形式
      jobName: result.data.jobName ?? "", // バリデーション済みの jobName を使用 (null/undefined なら空文字に)
      startTime: result.data.startTime,
      endTime: result.data.endTime,
      wage: Number(result.data.wage ?? 0), // バリデーション済みの wage を数値に変換 (null/undefined なら 0 に)
      transport: Number(result.data.transport ?? 0), // 同上
      allowance: Number(result.data.allowance ?? 0), // 同上
    };

    postConfig(dataToSend);
  };

  // --- 初期データ取得 ---
  useEffect(() => {
    fetchWageConfigs();
  }, []);

  // --- 表示用データ加工 ---
  const groupedConfigs = useMemo(() => {
    const grouped: { [key: string]: WageConfig[] } = {};
    DAYS_OF_WEEK.forEach(day => grouped[day] = []);

    if (Array.isArray(wageConfigs)) {
      wageConfigs.forEach(config => {
        if (grouped[config.day]) {
          grouped[config.day].push(config);
          grouped[config.day].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        } else {
          console.warn(`Unknown day encountered in config: ${config.day}`);
        }
      });
    }
    return grouped;
  }, [wageConfigs]);

  // --- レンダリング ---
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>時給設定</h1>
      
      {message && (
        <div style={{
          padding: '12px',
          margin: '15px 0',
          border: `1px solid ${message.type === 'success' ? 'darkgreen' : 'darkred'}`,
          backgroundColor: message.type === 'success' ? '#e6ffed' : '#ffebee',
          color: message.type === 'success' ? 'darkgreen' : 'darkred',
          borderRadius: '5px',
          fontSize: '0.95em'
        }}>
          {message.text}
        </div>
      )}

      <h2>新規設定の追加</h2>
      <form onSubmit={handleSubmit} style={{ marginBottom: '30px', padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px', backgroundColor: '#fdfdfd' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>曜日<span style={{color: 'red'}}>*</span>:</label>
          {DAYS_OF_WEEK.map(day => (
            <label key={day} style={{ marginRight: '15px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                value={day}
                checked={selectedDays.includes(day)}
                onChange={() => toggleDay(day)}
                style={{ marginRight: '5px' }}
              />
              {day}
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '15px' }}>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>仕事:</label>
            <input type="text" value={jobName} onChange={e => setjobName(e.target.value)} placeholder="家庭教師" style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>開始時間<span style={{color: 'red'}}>*</span>:</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>終了時間<span style={{color: 'red'}}>*</span>:</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>時給 (円)<span style={{color: 'red'}}>*</span>:</label>
            <input type="number" value={wage} onChange={e => setWage(e.target.value)} required min="0" placeholder="例: 1200" style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>交通費 (円):</label>
            <input type="number" value={transport} onChange={e => setTransport(e.target.value)} min="0" placeholder="例: 500" style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>その他手当 (円):</label>
            <input type="number" value={allowance} onChange={e => setAllowance(e.target.value)} min="0" placeholder="例: 100" style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}/>
          </div>
        </div>
        <div>
          <button type="submit" disabled={loading} style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
            {loading ? '送信中...' : '設定を保存'}
          </button>
          <button type="button" onClick={resetForm} disabled={loading} style={{ marginLeft: '10px', padding: '10px 15px', cursor: 'pointer' }}>
            リセット
          </button>
        </div>
      </form>

      <h2>現在の時給設定一覧</h2>
      {loading && wageConfigs.length === 0 ? (
        <p>読み込み中...</p>
      ) : !loading && wageConfigs.length === 0 ? (
         <p>現在登録されている設定はありません。上のフォームから追加してください。</p>
      ) : (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '12px',
            marginTop: '20px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            padding: '15px',
            backgroundColor: '#f8f9fa'
          }}>
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} style={{ borderRight: day !== '日' ? '1px solid #e0e0e0' : 'none', paddingRight: '12px' }}>
              <h3 style={{ 
                  textAlign: 'center', 
                  margin: '0 0 15px 0', 
                  borderBottom: '2px solid #007bff',
                  paddingBottom: '8px',
                  color: '#0056b3',
                  fontSize: '1.1em'
                 }}>
                {day}
              </h3>
              {groupedConfigs[day] && groupedConfigs[day].length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {groupedConfigs[day].map((config) => (
                    <li key={config.id} style={{
                        border: '1px solid #ced4da',
                        borderRadius: '5px',
                        padding: '10px',
                        marginBottom: '10px',
                        backgroundColor: '#ffffff',
                        fontSize: '0.9em',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                      <div style={{ fontWeight: '600', marginBottom: '5px', color: '#333' }}>{config.jobName || '(職種未設定)'}</div>
                      <div style={{ color: '#555', marginBottom: '3px' }}>{config.startTime} - {config.endTime}</div>
                      <div style={{ marginTop: '5px', color: '#17a2b8', fontWeight: 'bold' }}>{config.wage?.toLocaleString()} 円/時</div>
                      {config.transport > 0 && (
                        <div style={{ marginTop: '3px', fontSize: '0.85em', color: '#6c757d' }}>
                          交通費: {config.transport.toLocaleString()} 円
                        </div>
                      )}
                      {config.allowance > 0 && (
                        <div style={{ marginTop: '3px', fontSize: '0.85em', color: '#6c757d' }}>
                          手当: {config.allowance.toLocaleString()} 円
                        </div>
                      )}
                      <button
                        onClick={() => deleteWageConfig(config.id)}
                        disabled={loading}
                        title={`ID: ${config.id} を削除`}
                        style={{
                          marginTop: '10px',
                          fontSize: '0.85em',
                          padding: '3px 8px',
                          backgroundColor: 'transparent',
                          color: '#dc3545',
                          border: '1px solid #dc3545',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s, color 0.2s'
                        }}
                        onMouseOver={e => { e.currentTarget.style.backgroundColor = '#dc3545'; e.currentTarget.style.color = 'white';}}
                        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dc3545';}}
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ textAlign: 'center', color: '#6c757d', fontSize: '0.9em', marginTop: '10px' }}>未設定</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <button 
          onClick={handleHomeClick}
          style={{
            padding: '10px 20px',
            fontSize: '1em',
            cursor: 'pointer',
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px'
          }}
         >
          ホーム画面へ戻る
        </button>
      </div>
    </div>
  );
}

export default Config;