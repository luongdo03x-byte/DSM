export type AuthContext={brands:Array<{id:string;name?:string;slug?:string}>};

export function nextBrandRoute(context:AuthContext){
  const brand=context.brands[0];
  if(!brand)throw new Error('NO_BRAND');
  return `/app/brands/${brand.id}/overview`;
}

export function loginErrorMessage(error:unknown){
  const code=error instanceof Error?error.message:String(error??'');
  if(code==='NO_BRAND')return 'Tài khoản chưa được gán thương hiệu.';
  if(code==='INVALID_CREDENTIALS'||code==='HTTP_401')return 'Email hoặc mật khẩu không đúng.';
  if(code==='UNAUTHORIZED')return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return 'Đăng nhập không thành công. Vui lòng thử lại.';
}
