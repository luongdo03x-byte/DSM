import {LoginForm} from '../../../features/auth/login-form.tsx';

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero__content">
        <span className="login-eyebrow">DSM · Social Dropship Manager</span>
        <h1>Quản lý nội dung và xuất bản đa nền tảng trong một nơi.</h1>
        <p>Theo dõi sản phẩm, nội dung, lịch đăng, tài khoản và hiệu suất trên Facebook, Instagram, Threads và TikTok.</p>
        <div className="login-platforms"><span>Facebook</span><span>Instagram</span><span>Threads</span><span>TikTok</span></div>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <div className="app-brand login-brand"><span className="app-brand__mark">D</span><span className="app-brand__text"><strong>DSM</strong><span>Bảng điều khiển vận hành</span></span></div>
        <div className="login-heading"><h2>Chào mừng trở lại</h2><p>Đăng nhập để tiếp tục quản lý thương hiệu của bạn.</p></div>
        <LoginForm/>
      </div>
    </section>
  </main>;
}
