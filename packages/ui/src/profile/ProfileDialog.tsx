import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ProfileAvatar, SpinningMoonAvatar } from "@/profile/ProfileAvatar.js";
import { imageFileToAvatarDataUrl, setLocalProfile, useLocalProfile } from "@/profile/localProfile.js";

/** 编辑个人资料：改名字、换头像（默认是自转的月球）。资料只存在本机。 */
export function ProfileDialog({ open, onOpenChange, defaultName }: { open: boolean; onOpenChange: (open: boolean) => void; defaultName: string }) {
  const { intl } = useZCodeIntl();
  const profile = useLocalProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 每次打开都从当前保存的值重新开始，避免上次取消的草稿残留。
  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setAvatar(profile.avatar);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在打开瞬间同步
  }, [open]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatar(await imageFileToAvatarDataUrl(file));
      setError(null);
    } catch {
      setError(intl.formatMessage({ id: "profile.avatarError" }));
    }
  };

  const save = () => {
    setLocalProfile({ name, avatar });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="profile-dialog">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage({ id: "profile.title" })}</DialogTitle>
          <DialogDescription>{intl.formatMessage({ id: "profile.hint" })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="grid size-24 place-items-center rounded-full">
            {avatar ? (
              <img src={avatar} alt="" className="size-24 rounded-full object-cover" />
            ) : (
              <SpinningMoonAvatar size={96} />
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {intl.formatMessage({ id: "profile.uploadAvatar" })}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!avatar} onClick={() => setAvatar("")}>
              {intl.formatMessage({ id: "profile.useMoon" })}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void pickFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          {error ? (
            <p role="alert" className="text-ui-base text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-ui-base font-medium text-foreground">{intl.formatMessage({ id: "profile.name" })}</span>
          <Input
            value={name}
            maxLength={24}
            placeholder={defaultName || intl.formatMessage({ id: "profile.namePlaceholder" })}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {intl.formatMessage({ id: "profile.cancel" })}
          </Button>
          <Button type="button" onClick={save}>
            {intl.formatMessage({ id: "profile.save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ProfileAvatar };
