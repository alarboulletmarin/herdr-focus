import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, Button, InputState, Input } from "gpui-base";
import { appHome, home, theme, layout, run, exec, props, closeOverlay, checking, shared, setShared } from "herdr";
import * as fs from "fs/promises";
import { imageFile, validateImage } from "./logic.js";

const DIR = "backgrounds/focus";

export default class Backgrounds extends View {
  init(_props, cx) {
    this.images = [];
    this.error = "";
    this.busy = false;
    this.input = InputState.new({ placeholder: "Image path, e.g. ~/Pictures/sky.jpg" });
    this.input.on("submit", (_e, cx) => this.importImage(this.input.value(), cx));
    this.fit = layout()?.background?.fit ?? "cover";
    if (checking()) return;
    this.reload(cx);
  }

  reload(cx) {
    cx.spawn(async cx => {
      try {
        await fs.mkdir(`${appHome()}/${DIR}`, { recursive: true });
        this.images = (await fs.readdir(`${appHome()}/${DIR}`)).filter(imageFile).sort();
      } catch (e) { this.error = String(e.message ?? e); }
      cx.notify();
    });
  }

  apply(path, fit = this.fit) {
    // Only the background changes; all launcher controls belong to the layout.
    run("layout.set", { layout: { ...layout(), background: path ? { image: path, fit } : "#101b2b" } });
    setShared("focus.background", path);
    this.fit = fit;
  }

  importImage(source, cx) {
    if (this.busy || !source.trim()) return;
    const path = source.trim().replace(/^~(?=\/|$)/, home());
    this.busy = true;
    this.error = "";
    cx.spawn(async cx => {
      try {
        if (!imageFile(path)) throw new Error("Use a PNG, JPEG, WebP or GIF image.");
        const bytes = await fs.readFile(path);
        validateImage(bytes);
        await fs.mkdir(`${appHome()}/${DIR}`, { recursive: true });
        const name = `${Date.now()}-${path.split(/[\\/]/).pop()}`;
        await fs.writeFile(`${appHome()}/${DIR}/${name}`, bytes);
        this.apply(`${DIR}/${name}`);
        this.input.set_value("");
        this.reload(cx);
      } catch (e) { this.error = String(e.message ?? e); }
      this.busy = false;
      cx.notify();
    });
  }

  browse(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async cx => {
      try {
        const result = await exec("zenity", ["--file-selection", "--title=Choose a background", "--file-filter=Images | *.png *.jpg *.jpeg *.webp *.gif *.PNG *.JPG *.JPEG *.WEBP *.GIF"], { timeout: 600000 });
        this.busy = false;
        if (result.code === 0 && result.stdout.trim()) this.importImage(result.stdout.trim(), cx);
        else if (result.code !== 1) this.error = "Could not open the picker. Paste an image path below.";
      } catch { this.busy = false; this.error = "Paste an image path below, or drop an image here."; }
      cx.notify();
    });
  }

  button(id, label, action, selected = false) {
    const t = theme();
    return Button.new(id).h(30).px(10).rounded(7).flex().items_center().justify_center().text_size(12)
      .bg(selected ? t.raised : t.surface).text_color(t.foreground).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => action(cx)).child(label);
  }

  render() {
    const t = theme();
    const active = layout()?.background?.image ?? shared("focus.background");
    return v_flex().w_full().h(460).p(20).gap(12).bg(t.popover).text_color(t.foreground)
      .on_drop((e, cx) => { if (e.paths[0]) this.importImage(e.paths[0], cx); })
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(16).font_semibold().child("Background"))
        .child(this.button("close", "Close", () => closeOverlay(props().overlay))))
      .child(div().text_size(12).text_color(t.muted).child("Choose an image, paste its path or drop it here. Your selection is saved."))
      .child(h_flex().gap(7)
        .child(this.button("browse", this.busy ? "Opening…" : "Choose image…", cx => this.browse(cx)))
        .child(this.button("cover", "Fill", () => this.apply(active, "cover"), this.fit === "cover"))
        .child(this.button("contain", "Fit", () => this.apply(active, "contain"), this.fit === "contain"))
        .child(this.button("none", "Solid", () => this.apply(null))))
      .child(h_flex().gap(7).items_center()
        .child(Input.new(this.input).flex_1().h(32).px(9).border_1().border_color(t.input).rounded(7).text_size(12))
        .child(this.button("import", "Add", cx => this.importImage(this.input.value(), cx))))
      .when(Boolean(this.error), el => el.child(div().text_size(11).text_color(t.blocked).child(this.error)))
      .child(v_flex().flex_1().min_h(0).gap(6).overflow_y_scrollbar()
        .when(this.images.length === 0, el => el.child(div().py(20).text_size(12).text_color(t.dim).child("Your backgrounds will appear here.")))
        .children(this.images.map((name, i) => this.button(`image-${i}`, h_flex().gap(12).items_center()
          .child(image(`${DIR}/${name}`).w(80).h(40).rounded(4))
          .child(div().flex_1().min_w(0).text_size(11).child(name.replace(/^\d+-/, "").slice(0, 42))), () => this.apply(`${DIR}/${name}`), active === `${DIR}/${name}`).h(52).w_full())))
      .child(div().text_size(10).text_color(t.dim).child("PNG, JPEG, WebP, GIF · Images are copied into backgrounds/focus"));
  }
}
