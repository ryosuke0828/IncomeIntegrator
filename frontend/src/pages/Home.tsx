import React, { useState, useEffect, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import { useNavigate } from 'react-router-dom'

const Home = () => {
  const navigate = useNavigate();

  // タイムゾーンを考慮した日付フォーマット関数
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const calendarRef = useRef(null);
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentDateRange, setCurrentDateRange] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    // タイムゾーンを考慮した日付フォーマット
    return {
      start: formatDate(firstDay),
      end: formatDate(lastDay)
    };
  });

  // データ取得中かどうかのフラグ
  const [isFetching, setIsFetching] = useState(false);
  
  // 時給設定を保存するstate
  const [wageConfigs, setWageConfigs] = useState([]);
  
  // 月間合計収入を保存するstate
  const [totalMonthlyIncome, setTotalMonthlyIncome] = useState(0);

  const baseUrl = process.env.REACT_APP_API_BASE_URL

  // configページへ遷移する関数
  const handleConfigClick = () => {
    navigate('/config');
  };

  // 時給設定を取得するためのuseEffect
  useEffect(() => {
    const fetchWageConfigs = async () => {
      try {
        const url = `${baseUrl}?action=getConfigs`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Error feching wage configure');
        }

        const data = await response.json();
        setWageConfigs(data);
      } catch (err) {
        console.error('Error feching wage configure:', err);
      }
    };

    fetchWageConfigs();
  }, [baseUrl]); // baseUrl が変更されたときのみ再実行

  useEffect(() => {
    if (isFetching) {
      console.log('Skip since isFetching is true');
      return;
    }

    const fetchEvents = async () => {
      setLoading(true);
      setIsFetching(true);
      try {
        const url = `${baseUrl}?action=getEvents&start=${currentDateRange.start}&end=${currentDateRange.end}`;
        console.log(`Start feching data: ${url}`);
        const response = await fetch(
          url,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        )

        if (!response.ok) {
          throw new Error('There is a problem in response from server')
        }
        const data = await response.json()

        const eventsWithIncome = data.map(event => {
          const dailyIncome = calculateDailyIncome(event, wageConfigs);
          return {
            ...event,
            title: event.title || '', // 元のタイトルのみを使用
            extendedProps: {
              ...event.extendedProps,
              dailyIncome
            }
          };
        });

        setEvents(eventsWithIncome);
      } catch (err) {
        setError(err.message)
        console.error('Error feching events:', err)
      } finally {
        setLoading(false); // ローディング完了
        setIsFetching(false); // フェッチ完了
      }
    }

    // wageConfigs が取得されてからイベントを取得する
    // 初回レンダリング時や wageConfigs が空の時は fetchWageConfigs が実行されるのを待つ
    if (wageConfigs.length > 0) {
        console.log('Execute fechEvents since wageConfigs is available');
        fetchEvents();
    } else {
        console.log('Skip fetchEvents since wageConfigs is not available');
    }
  }, [currentDateRange, baseUrl, wageConfigs]); // isFetching と loading を削除

  // イベントが更新されたら月間合計収入を計算
  useEffect(() => {
    if (events.length > 0) {
      const total = events.reduce((sum, event) => {
        return sum + (event.extendedProps?.dailyIncome || 0);
      }, 0);
      setTotalMonthlyIncome(total);
    } else {
      setTotalMonthlyIncome(0);
    }
  }, [events]);

  // 1日の収入を計算する関数
  const calculateDailyIncome = (event, configs) => {
    // イベントの日付から曜日を取得
    const eventDate = new Date(event.start);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][eventDate.getDay()];
    
    // イベントの開始と終了時間を取得
    const startTime = event.start ? new Date(event.start) : null;
    const endTime = event.end ? new Date(event.end) : null;
    
    // イベントのタイトル（仕事名）を取得
    const eventTitle = event.title ? event.title.trim() : null; // 収入情報が含まれない前提

    if (!startTime || !endTime || !eventTitle) {
      console.warn('Invalid event data:', event);
      return 0;
    }
    
    // configsが無効な場合は0を返す
    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      console.warn('There is no wage config');
      return 0;
    }

    // 勤務時間（ミリ秒）を計算
    const workDurationMs = endTime.getTime() - startTime.getTime();
    
    // この日の曜日と仕事名に適用される全ての時給設定をフィルタリング
    const applicableConfigs = configs.filter(config => {
      // 曜日と仕事名が一致するか確認
      return config && config.day && config.day === dayOfWeek && config.jobName && config.jobName === eventTitle;
    });
    
    if (applicableConfigs.length === 0) {
      console.log(`${eventTitle} Invalid wage config for (${dayOfWeek}) `);
      return 0;
    }
    
    // イベント期間内で適用される時間帯と設定のマッピングを作成
    let totalIncome = 0;
    
    // 5分単位で時間帯をチェック（精度を上げたい場合は間隔を短くする）
    const checkIntervalMinutes = 5;
    const checkIntervalMs = checkIntervalMinutes * 60 * 1000;
    
    // 勤務開始時間から終了時間まで、設定した間隔でループ
    for (let currentTimeMs = startTime.getTime(); currentTimeMs < endTime.getTime(); currentTimeMs += checkIntervalMs) {
      const currentTime = new Date(currentTimeMs);
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      
      // この時点で適用される設定を検索
      const matchingConfig = applicableConfigs.find(config => {
        try {
          const configStartTime = config.startTime.split(':').map(Number);
          const configEndTime = config.endTime.split(':').map(Number);
          
          // 現在時刻が設定の時間範囲内かチェック
          const isInTimeRange = 
            (currentHour > configStartTime[0] || 
             (currentHour === configStartTime[0] && currentMinute >= configStartTime[1])) &&
            (currentHour < configEndTime[0] || 
             (currentHour === configEndTime[0] && currentMinute < configEndTime[1])); // 終了時刻の境界を < に変更
          
          return isInTimeRange;
        } catch (err) {
          console.error('Error in checking hour:', err);
          return false;
        }
      });
      
      if (matchingConfig) {
        const intervalHours = checkIntervalMinutes / 60; // 時間単位に変換
        const intervalIncome = intervalHours * Number(matchingConfig.wage || 0);
        totalIncome += intervalIncome;
      }
    }
    
    // 交通費と手当を追加
    const primaryConfig = applicableConfigs[0];
    if (primaryConfig) {
      const transportIncome = Number(primaryConfig.transport || 0);
      const allowanceIncome = Number(primaryConfig.allowance || 0);
      totalIncome += transportIncome + allowanceIncome;
    }
    
    return Math.round(totalIncome);
  };

  // カレンダーが準備完了したら呼ばれるコールバック
  const handleCalendarReady = (calendar) => {
    console.log('Calendar is ready');
  };

  const handleDatesSet = (dateInfo) => {
    // カレンダーの表示範囲が変更されたときに呼ばれる
    const start = dateInfo.startStr.split('T')[0] // YYYY-MM-DD形式に変換
    const end = dateInfo.endStr.split('T')[0]
    
    console.log(`Changed range: ${start} to ${end}`)
    
    // 日付範囲が変わった場合のみ状態を更新
    if (start !== currentDateRange.start || end !== currentDateRange.end) {
      console.log(`Changed range: ${start} to ${end}`);
      // 状態を非同期的に更新するため setTimeout を使用
      setTimeout(() => {
        setCurrentDateRange({ start, end });
      }, 0);
    }
  }

  // イベントの内容をカスタマイズする関数
  const renderEventContent = (eventInfo) => {
    const dailyIncome = eventInfo.event.extendedProps?.dailyIncome;
    return (
      <>
        <br />
        <i>{eventInfo.event.title}</i>
        {dailyIncome !== undefined && ( // 収入がある場合のみ表示
          <>
            <br />
            <span>¥{dailyIncome.toLocaleString()}</span>
          </>
        )}
      </>
    );
  };

  if (loading && !events.length) return <div>読み込み中...</div>
  if (error) return <div>エラー: {error}</div>

  return (
    <div>
      <FullCalendar 
        ref={calendarRef}
        plugins={[dayGridPlugin]} 
        initialView="dayGridMonth"
        events={events}
        datesSet={handleDatesSet}
        eventContent={renderEventContent} // 追加
        viewDidMount={handleCalendarReady}
        forceEventDuration={true}
        firstDay={0} // 週の開始日を日曜日に設定
      />
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '5px',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ color: '#343a40', margin: 0 }}>
          今月の合計収入: ¥{totalMonthlyIncome.toLocaleString()}
        </h3>
        <button 
          onClick={handleConfigClick}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          設定
        </button>
      </div>
    </div>
  )
}

export default Home