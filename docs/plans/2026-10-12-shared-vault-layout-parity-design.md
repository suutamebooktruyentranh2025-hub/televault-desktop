# Thiết Kế Đồng Bộ Layout: "Chia sẻ với tôi" (Shared Vault) Khớp Layout "Kho lưu trữ" (My Vault)

## 1. Mục Tiêu & Bối Cảnh
Đồng bộ hóa trải nghiệm người dùng và cấu trúc giao diện giữa **Chia sẻ với tôi (Shared Vault)** và **Kho lưu trữ (My Vault)**:
- Đưa **Thanh Breadcrumb** của Shared Vault xuống nằm ngay dưới TopBar trong một thanh điều hướng riêng biệt (`min-h-[40px]`), thay vì bị ép chung trong TopBar bên trái.
- TopBar bên trái của Shared Vault sẽ hiển thị tiêu chuẩn: `[IconSharedDrive] + Tên Kho chia sẻ (hoặc "Chia sẻ với tôi")`.
- Hỗ trợ click header để đảo chiều sắp xếp cột (`onToggleSort`) cho Shared Vault như My Vault.

## 2. Chi Tiết Kiến Trúc & Giao Diện

### 2.1. TopBar Header (`src/components/VaultShell.jsx`)
- Khi `isSharedSection` (`navigation.section === 'shared-vault'`):
  - **`topBarLeftContent`**:
    - Icon: `IconSharedDrive` (màu `var(--gd-primary)`).
    - Tiêu đề: `sharedVaults.activeVault?.title || t('navSharedWithMe')`.
  - **`topBarRightContent`**:
    - Nút Quét Vault (`handleRescanVault`).
    - Nút chuyển chế độ xem Danh sách / Lưới (`IconListView`, `IconGridView`).

### 2.2. Thanh Breadcrumb Sub-Header (`src/components/vault/VaultContentArea.jsx`)
- Trong `renderSharedVault()`:
  - Bổ sung thanh bar phụ phía trên `BrowserScreen`:
    ```jsx
    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gd-border)] bg-[var(--gd-bg)] min-h-[40px] shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        <DriveBreadcrumb
          crumbs={sharedVaults.breadcrumbs}
          onNavigate={sharedVaults.goTo}
          showSingle={true}
        />
        {folderSummary?.text && (
          <span
            className="text-xs text-[var(--gd-text-secondary)] whitespace-nowrap select-none opacity-75 hidden sm:inline shrink-0"
            title={folderSummary.tooltip}
          >
            • {folderSummary.text}
          </span>
        )}
      </div>
    </div>
    ```

### 2.3. Tương Tác Sắp Xếp Cột (`BrowserScreen` trong Shared Vault)
- Truyền `onToggleSort={sharedVaults.toggleSort}` vào `BrowserScreen` trong `renderSharedVault`.
- Cho phép người dùng click vào các header cột: **Tên**, **Sửa đổi**, **Kích thước** để sắp xếp tăng/giảm dần.

## 3. Quy Chuẩn Dự Án
- **i18n:** Sử dụng key đã có `navSharedWithMe` hoặc bổ sung đối xứng (`vi` / `en`). Tuyệt đối không hardcode chuỗi text trần trụi.
- **Commit Etiquette:** Không tự ý commit nếu không có lệnh rõ ràng của người dùng.
