-- ==============================================================
-- Migration: 20260414000009_cascade_on_delete.sql
-- Descrição: Muda barbershops.owner_id de ON DELETE RESTRICT
--            para ON DELETE CASCADE, permitindo deletar um
--            usuário sem precisar remover a barbearia antes.
-- ==============================================================

ALTER TABLE public.barbershops
  DROP CONSTRAINT IF EXISTS barbershops_owner_id_fkey;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;
