-- bent_wire_icon.sql — the bent wire's pixel icon (public/item-pixels/bent-wire.png), approved by Sam 2026-11-13
-- ("C is fine": option C of four PixelLab candidates, job 6df6c50b, styled on the drow lockpick's icon).
-- Run only after the PR that adds the PNG has merged and deployed, or the bag shows a broken image.
-- Touches one field on one row, and only while it is still empty.
update public.items set pixel_icon_url = '/item-pixels/bent-wire.png'
 where slug = 'bent-wire' and pixel_icon_url is null;
