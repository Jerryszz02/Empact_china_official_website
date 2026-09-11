"use client";

import { useAuth } from "@payloadcms/ui";

export function BusinessAdminNav() {
  const { logOut } = useAuth();
  return (
    <nav className="business-admin-nav" aria-label="后台导航">
      <a className="business-admin-nav__brand" href="/admin">
        Empact <span>内容工作台</span>
      </a>
      <div className="business-admin-nav__links">
        <a href="/admin">业务与案例</a>
        <a href="/admin/account">账号设置</a>
        <button type="button" onClick={() => void logOut()}>
          退出登录
        </button>
      </div>
    </nav>
  );
}
