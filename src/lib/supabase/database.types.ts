// Tipos del esquema `permisos`. Escritos a mano (no autogenerados) para no arrastrar
// las decenas de tablas de `siesa_raw`. Mantener sincronizado con las migraciones.

export type RolUsuario = 'coordinador' | 'porteria' | 'rrhh';
export type EstadoSolicitud =
  | 'pendiente' | 'aprobado' | 'rechazado' | 'en_curso' | 'cerrado';
export type TipoMovimiento = 'salida' | 'regreso';
export type CodigoTipo = 'PP' | 'PM' | 'PA' | 'PE';

export interface Database {
  permisos: {
    Tables: {
      tipos_permiso: {
        Row: { codigo: CodigoTipo; nombre: string; tope_min_mes: number | null; exige_soporte: boolean; activo: boolean };
        Insert: { codigo: CodigoTipo; nombre: string; tope_min_mes?: number | null; exige_soporte?: boolean; activo?: boolean };
        Update: Partial<Database['permisos']['Tables']['tipos_permiso']['Insert']>;
        Relationships: [];
      };
      usuarios: {
        Row: { user_id: string; rol: RolUsuario; nombre_cargo: string; documento: string | null; activo: boolean; creado_en: string };
        Insert: { user_id: string; rol: RolUsuario; nombre_cargo: string; documento?: string | null; activo?: boolean; creado_en?: string };
        Update: Partial<Database['permisos']['Tables']['usuarios']['Insert']>;
        Relationships: [];
      };
      coordinador_centros: {
        Row: { user_id: string; centro_costo: string };
        Insert: { user_id: string; centro_costo: string };
        Update: Partial<{ user_id: string; centro_costo: string }>;
        Relationships: [];
      };
      solicitudes: {
        Row: {
          id: number; documento: string; nombre: string; centro_costo: string;
          tipo: CodigoTipo; fecha: string; hora_salida: string; minutos: number; observaciones: string | null;
          min_cubierto: number; min_personal: number; estado: EstadoSolicitud;
          decidido_por: string | null; decidido_en: string | null; motivo_rechazo: string | null; comentario_coordinador: string | null;
          alerta_rrhh: boolean; para_director: boolean;
          soporte_path: string | null; soporte_subido_en: string | null;
          salida_real: string | null; regreso_real: string | null; sin_regreso: boolean;
          creado_en: string; creado_por: string | null; cancelado_en: string | null;
        };
        Insert: {
          id?: number; documento: string; nombre: string; centro_costo: string;
          tipo: CodigoTipo; fecha: string; hora_salida: string; minutos: number; observaciones?: string | null;
          min_cubierto?: number; min_personal?: number; estado?: EstadoSolicitud;
          decidido_por?: string | null; decidido_en?: string | null; motivo_rechazo?: string | null; comentario_coordinador?: string | null;
          alerta_rrhh?: boolean; para_director?: boolean;
          soporte_path?: string | null; soporte_subido_en?: string | null;
          salida_real?: string | null; regreso_real?: string | null; sin_regreso?: boolean;
          creado_en?: string; creado_por?: string | null; cancelado_en?: string | null;
        };
        Update: Partial<Database['permisos']['Tables']['solicitudes']['Insert']>;
        Relationships: [];
      };
      movimientos_porteria: {
        Row: {
          id: number; client_id: string; solicitud_id: number; tipo: TipoMovimiento;
          hora_marcada: string; registrado_en: string; registrado_por: string | null; anulado: boolean;
        };
        Insert: {
          id?: number; client_id: string; solicitud_id: number; tipo: TipoMovimiento;
          hora_marcada: string; registrado_en?: string; registrado_por?: string | null; anulado?: boolean;
        };
        Update: Partial<Database['permisos']['Tables']['movimientos_porteria']['Insert']>;
        Relationships: [];
      };
      historial_estados: {
        Row: {
          id: number; solicitud_id: number; estado_anterior: EstadoSolicitud | null;
          estado_nuevo: EstadoSolicitud; actor: string | null; en: string; detalle: string | null;
        };
        Insert: {
          id?: number; solicitud_id: number; estado_anterior?: EstadoSolicitud | null;
          estado_nuevo: EstadoSolicitud; actor?: string | null; en?: string; detalle?: string | null;
        };
        Update: Partial<Database['permisos']['Tables']['historial_estados']['Insert']>;
        Relationships: [];
      };
      consentimientos: {
        Row: { id: number; documento: string; version_texto: string; aceptado_en: string; ip: string | null };
        Insert: { id?: number; documento: string; version_texto: string; aceptado_en?: string; ip?: string | null };
        Update: Partial<Database['permisos']['Tables']['consentimientos']['Insert']>;
        Relationships: [];
      };
      intentos_ingreso: {
        Row: { id: number; documento_hash: string; ip: string | null; exitoso: boolean; en: string };
        Insert: { id?: number; documento_hash: string; ip?: string | null; exitoso?: boolean; en?: string };
        Update: Partial<Database['permisos']['Tables']['intentos_ingreso']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      mi_rol: { Args: Record<string, never>; Returns: RolUsuario };
      mis_centros: { Args: Record<string, never>; Returns: string[] };
      soy_director: { Args: Record<string, never>; Returns: boolean };
      empleado_por_documento: {
        Args: { p_doc: string };
        Returns: { documento: string; nombre: string; centro_costo: string; cargo: string }[];
      };
      resumen_sync: {
        Args: Record<string, never>;
        Returns: { ultima_sync: string | null; empleados_activos: number }[];
      };
    };
    Enums: {
      rol_usuario: RolUsuario;
      estado_solic: EstadoSolicitud;
      tipo_mov: TipoMovimiento;
    };
    CompositeTypes: Record<string, never>;
  };
}
